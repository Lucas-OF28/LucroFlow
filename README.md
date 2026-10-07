# LucroFlow

**Controle seu estoque. Entenda seu lucro.**

Plataforma de gestão de compras, vendas, estoque, financeiro e lucratividade para pequenos negócios.
Abra o painel e responda na hora: quanto investi, quanto tenho em estoque, quanto vendi, quanto **realmente** lucrei,
quanto tenho a receber e quais produtos estão parados.

- Custo médio ponderado com **custo histórico gravado em cada venda** (o lucro de uma venda antiga nunca muda).
- Faturamento ≠ lucro ≠ caixa: receita reconhecida, recebimentos e contas a receber separados.
- Multiempresa desde o início, com isolamento no **backend e no banco (RLS)**.
- Transações com trava de linha: duas pessoas vendendo a última unidade → só uma venda é confirmada.

Arquitetura, fórmulas e decisões: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · Operação, backup e deploy: [docs/OPERACAO.md](docs/OPERACAO.md)

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui ·
Drizzle ORM · PostgreSQL (Supabase) · Supabase Auth + Storage · Recharts · Vitest · GitHub Actions · Vercel.

## Estrutura

```
src/
  app/                 rotas: (auth) login/cadastro, onboarding, (app) área logada, api/ (export CSV, fotos, health)
  components/          ui/ (shadcn), shared/ (design system), charts/, e componentes por módulo
  lib/finance/         TODAS as fórmulas financeiras (puras, testadas) — dinheiro, rateio, custo médio, lucro, margem, ROI
  lib/                 datas (fuso da empresa), formatação pt-BR, validações zod, permissões
  server/db/           schema Drizzle, cliente, transação com RLS (withTenant)
  server/services/     regras de negócio transacionais (compras, vendas, devoluções, estoque, relatórios, inteligência…)
  server/actions/      Server Actions (sessão → empresa validada → serviço)
  server/auth|storage/ adaptadores do Supabase (únicos pontos que conhecem o provedor)
  proxy.ts             renovação de sessão e proteção de rotas
drizzle/               migrations versionadas (schema + segurança/RLS)
scripts/               migrate, seed, banco local
tests/                 unit/ (finanças) e integration/ (PostgreSQL real: fluxo completo, concorrência, RLS…)
```

## Instalação

Requisitos: Node.js ≥ 20.9 (recomendado 22+), um projeto no [Supabase](https://supabase.com) (plano gratuito serve).

```bash
npm install
cp .env.example .env.local   # preencha as variáveis (abaixo)
npm run db:migrate           # cria tabelas, constraints, índices, papéis e RLS
npm run db:seed              # opcional: empresa demo com 6 meses de dados
npm run dev                  # http://localhost:3000
```

### Variáveis de ambiente

| Variável | Onde obter | Exposta ao navegador? |
|---|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → *Transaction pooler* (porta 6543) | **não** |
| `DATABASE_MIGRATION_URL` | mesma tela, *Session pooler* ou conexão direta (porta 5432) — usada só por migrations | **não** |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → `anon`/publishable key | sim (o RLS bloqueia acesso direto às tabelas) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role`/secret key | **nunca** — só servidor (Storage e seed) |
| `SUPABASE_STORAGE_BUCKET` | nome do bucket privado (padrão `lucroflow`) | não |
| `NEXT_PUBLIC_APP_URL` | URL pública do app (links de e-mail) | sim |
| `LOG_LEVEL` | `debug` \| `info` \| `warn` \| `error` | não |
| `SEED_DEMO_EMAIL` / `SEED_DEMO_PASSWORD` | opcional: usuário demo criado pelo seed | não |

Nunca faça commit de `.env.local` (já está no `.gitignore`).

### Supabase (uma vez por projeto)

1. **Auth → URL Configuration:** *Site URL* = `NEXT_PUBLIC_APP_URL`; adicione `…/auth/callback` em *Redirect URLs* (usado pela recuperação de senha).
   Não há verificação de e-mail no cadastro: o app cria a conta já confirmada (decisão D5).
2. **Storage:** crie o bucket **privado** `lucroflow` (sem políticas), com limite de arquivo de **50 MB**. Fotos até 50 MB vão do
   navegador direto ao Storage por um link de envio de uso único gerado pelo servidor; o servidor converte para WebP e apaga
   o original. A exibição usa URLs assinadas de 1 h. Fotos ficam em `businesses/{businessId}/products/{productId}/{uuid}.webp`.
3. Rode `npm run db:migrate` apontando para o projeto.

> A migration de segurança cria o papel `lucroflow_app`, ativa RLS em todas as tabelas e **revoga** o acesso dos papéis
> `anon`/`authenticated` do Supabase às tabelas — a API REST pública do Supabase não enxerga dados de negócio.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` / `npm start` | build e servidor de produção |
| `npm run typecheck` | TypeScript sem emitir arquivos |
| `npm run lint` | ESLint |
| `npm test` | todos os testes (unitários + integração) |
| `npm run test:unit` / `npm run test:integration` | separados |
| `npm run check` | typecheck + lint + testes |
| `npm run db:generate` | gera migration a partir de mudanças no schema (`src/server/db/schema`) |
| `npm run db:migrate` | aplica migrations pendentes |
| `npm run db:seed` | cria uma empresa demo (20 produtos, 10 clientes, 5 fornecedores, 20 compras, 30 vendas, 15 despesas) |
| `npm run db:local` | PostgreSQL local **sem Docker** em `localhost:54322` (dados em `.local-db/`) |
| `npm run db:studio` | Drizzle Studio |

## Testes

Os testes de integração sobem um **PostgreSQL real** automaticamente (binário oficial via `embedded-postgres`, sem Docker),
aplicam as migrations e exercitam os serviços. Em CI usa-se um serviço Postgres (`TEST_DATABASE_URL`).

Cobertos: custo médio, custo histórico (§66), lucro/prejuízo, margem ≠ ROI ≠ markup, rateio sem perda de centavos,
arredondamento, compra adicional, venda parcial, estoque insuficiente sem gravação parcial, **concorrência** (§67:
estoque 1 + duas vendas simultâneas → uma confirmada; 20 vendas sobre estoque 7 → 7), cancelamento, devolução parcial e
total, pagamento parcial, contas a receber, perdas, venda com prejuízo (aprovação por papel), **isolamento entre empresas**
(inclusive com `business_id` forjado), tabelas financeiras sem DELETE e CHECKs do banco.

## Deploy (Vercel)

1. Importe o repositório na Vercel. O `vercel.json` usa `npm run vercel-build` (typecheck + lint + testes financeiros + build):
   **se um teste crítico falhar, o deploy não acontece.**
2. Configure as variáveis por ambiente (*Production*, *Preview*, *Development*) — **use projetos Supabase diferentes**
   para produção e para preview/desenvolvimento.
3. Migrations de produção rodam no GitHub Actions (job `migrate-production`) só depois de o CI passar na `main`
   (secret `PRODUCTION_DATABASE_MIGRATION_URL` no environment `production`).

Detalhes, backup e restauração: [docs/OPERACAO.md](docs/OPERACAO.md).

## Regras financeiras (resumo)

| Conceito | Fórmula |
|---|---|
| Faturamento | produtos − descontos + frete cobrado − devoluções do período |
| CMV | custo histórico gravado nas vendas − custo devolvido ao estoque |
| Lucro bruto | faturamento − CMV |
| Lucro líquido | lucro bruto − custos das vendas (frete pago, taxas, comissões) − despesas − perdas |
| Margem | lucro ÷ receita · ROI = lucro ÷ custo · Markup = preço ÷ custo |
| Capital em estoque | Σ quantidade × custo médio (não é lucro) |

Compras **não** são despesa: viram estoque. Detalhes e decisões confirmadas (D1–D4) em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).
