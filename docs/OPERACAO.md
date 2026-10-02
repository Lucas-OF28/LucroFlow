# LucroFlow — Operação: ambientes, deploy, backup e restauração

## Ambientes

| Ambiente | App | Banco/Auth/Storage | Observação |
|---|---|---|---|
| Development | `npm run dev` | projeto Supabase de dev **ou** `npm run db:local` (só banco) | nunca aponte para produção |
| Preview | Vercel (PRs) | projeto Supabase de **staging** | dados fictícios (`db:seed`) |
| Production | Vercel (`main`) | projeto Supabase de **produção** | migrations só via CI |

Segredos ficam apenas nas variáveis da Vercel/GitHub. A `SUPABASE_SERVICE_ROLE_KEY` nunca é usada em código cliente
(os módulos que a leem importam `server-only`, o que quebra o build se forem importados no navegador).

## Fluxo de deploy

```
PR → CI (typecheck, lint, testes com Postgres real, drizzle-kit check, build) → review → merge na main
   → CI na main → job migrate-production (aplica migrations) → Vercel publica (vercel-build roda os testes de novo)
```

Regras para migrations:

- Toda mudança de banco é feita no schema (`src/server/db/schema`) + `npm run db:generate`, ou com
  `drizzle-kit generate --custom` para SQL manual (RLS, funções). **Nunca altere produção à mão.**
- Prefira migrations **aditivas** (nova coluna com default, nova tabela). Remoções em duas etapas: o código para de usar → próxima release remove.
- Toda tabela nova com `business_id` precisa de: `ENABLE ROW LEVEL SECURITY`, política `tenant_isolation` e `GRANT` explícito
  ao `lucroflow_app` (ver `drizzle/0001_security_rls.sql`). Tabelas financeiras novas: sem `DELETE`.

## Backup

Dados financeiros são o ativo mais importante do negócio. Estratégia em três camadas:

1. **Backups automáticos do Supabase** — diários no plano gratuito (retenção curta); no plano Pro, habilite
   **Point-in-Time Recovery** assim que houver uso real.
2. **Dump lógico próprio, diário, fora do Supabase** (independência do provedor — portabilidade):
   ```bash
   # usa a conexão direta/session (porta 5432)
   pg_dump "$DATABASE_MIGRATION_URL" --format=custom --no-owner --no-privileges \
     --schema=public --schema=app --schema=drizzle \
     --file="backups/lucroflow_$(date +%Y%m%d_%H%M).dump"
   ```
   Guarde em storage externo com criptografia e retenção (ex.: 30 diários + 12 mensais). Pode ser agendado num
   GitHub Action com `schedule:` ou num cron externo; o arquivo **não** vai para o repositório (`/backups` está no `.gitignore`).
3. **Fotos/comprovantes (Storage)**: sincronização periódica do bucket (`supabase storage cp -r` ou API S3 compatível do Supabase).

## Restauração

```bash
# 1. banco vazio (novo projeto Supabase ou Postgres próprio)
# 2. papel usado pelas políticas (o dump não leva papéis):
psql "$TARGET_URL" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='lucroflow_app') THEN CREATE ROLE lucroflow_app NOLOGIN; END IF; END \$\$; GRANT lucroflow_app TO CURRENT_USER;"
# 3. restaurar
pg_restore --dbname="$TARGET_URL" --no-owner --no-privileges --clean --if-exists backups/lucroflow_AAAAMMDD_HHMM.dump
# 4. reaplicar privilégios/RLS de forma idempotente (as migrations já registradas não rodam de novo):
psql "$TARGET_URL" -f drizzle/0001_security_rls.sql   # se necessário (GRANTs/REVOKEs)
```

## Teste de restauração (mensal)

Um backup que nunca foi restaurado não é backup. Uma vez por mês:

1. Restaure o dump mais recente num banco descartável (`npm run db:local` serve: `TARGET_URL=postgres://postgres:postgres@localhost:54322/lucroflow`).
2. Rode as verificações de integridade:
   ```sql
   -- saldo de estoque = soma do livro-razão (deve retornar 0)
   select count(*) from products p
   where p.stock_quantity <> (select coalesce(sum(quantity_delta),0) from inventory_movements m where m.product_id = p.id)
      or p.stock_value    <> (select coalesce(sum(value_delta),0)    from inventory_movements m where m.product_id = p.id);
   -- parcelas = faturamento da venda (deve retornar 0)
   select count(*) from sales s where s.total_revenue <> (select coalesce(sum(amount),0) from accounts_receivable ar where ar.sale_id = s.id);
   -- totais das compras = soma dos itens (deve retornar 0)
   select count(*) from purchases p where p.total <> (select sum(landed_total) from purchase_items i where i.purchase_id = p.id);
   ```
3. Compare a contagem de vendas/compras e o capital em estoque com a produção. Registre data e resultado.

## Observabilidade

- Logs estruturados em JSON (`src/server/logger.ts`), com campos sensíveis mascarados. Erros inesperados recebem um
  código curto mostrado ao usuário ("código AB12CD34") para correlação com o log, sem expor detalhes técnicos.
- `GET /api/health` para monitoramento de disponibilidade (verifica o banco).
- Pronto para plugar Sentry/OpenTelemetry no `runAction` e no `logger` sem tocar nos serviços.

## Migração futura para PostgreSQL próprio

Nada do domínio depende do Supabase: o banco é Postgres puro (RLS usa `app.current_user_id()`, não `auth.uid()`).
Para sair do Supabase: (1) `pg_dump`/`pg_restore` como acima; (2) trocar `DATABASE_URL`; (3) reimplementar
`src/server/auth/session.ts` + `src/lib/supabase/*` (Auth) e `src/server/storage` (Storage) com o novo provedor.
