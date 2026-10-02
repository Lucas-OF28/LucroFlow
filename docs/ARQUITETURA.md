# LucroFlow — Plano técnico e arquitetura

> Documento vivo. Registra as decisões tomadas, as fórmulas financeiras e as suposições.
> Qualquer mudança em regra financeira deve ser refletida aqui **e** nos testes.

## 1. Arquitetura

```
Navegador (React / RSC)
   │  Server Actions + Route Handlers (nunca acesso direto ao banco pelo browser)
   ▼
Next.js (App Router) ── src/app, src/components
   │  valida entrada (zod), resolve sessão + empresa ativa
   ▼
Camada de serviços (src/server/services)  ← regras de negócio, transações
   │  usa src/lib/finance (dinheiro/fórmulas puras, testadas)
   ▼
Drizzle ORM (src/server/db)  ── transação com SET LOCAL ROLE + app.user_id (RLS)
   ▼
PostgreSQL (Supabase hoje, qualquer Postgres amanhã)

Supabase Auth  ← isolado em src/server/auth
Supabase Storage ← isolado em src/server/storage (interface StorageDriver)
```

- **Nada do Supabase fora de `src/server/auth`, `src/server/storage` e `src/lib/supabase`.**
  Trocar de provedor = reescrever esses adaptadores, não o sistema.
- O banco é acessado **somente pelo servidor** via `DATABASE_URL` (Drizzle + postgres.js).
  O navegador nunca usa PostgREST/supabase-js para dados de negócio.
- `SUPABASE_SERVICE_ROLE_KEY` só é importada em módulos marcados com `import "server-only"`.

## 2. Estrutura de diretórios

```
src/
  app/                    rotas (App Router)
    (auth)/               login, cadastro, recuperar senha
    (app)/                área autenticada (layout com sidebar / bottom nav)
    onboarding/           criação da primeira empresa
    api/                  route handlers (export CSV, imagens)
  components/
    ui/                   shadcn/ui (gerados)
    shared/               design system do LucroFlow (MetricCard, MoneyInput, EmptyState…)
  features/<módulo>/      componentes + server actions por módulo (products, sales…)
  lib/
    finance/              dinheiro, percentuais, margem, ROI, custo médio, rateio (puro, sem I/O)
    format/               formatação pt-BR centralizada (moeda, data, número)
    dates/                períodos e timezone da empresa
    validations/          schemas zod compartilhados
  server/
    db/                   schema Drizzle, client, helper de transação com RLS
    services/             regras de negócio (purchases, sales, inventory, reports…)
    auth/                 sessão / usuário (adaptador Supabase Auth)
    storage/              uploads (adaptador Supabase Storage)
    logger.ts, errors.ts  logs estruturados e erros de domínio
drizzle/                  migrations versionadas (geradas + SQL custom de RLS)
scripts/                  migrate, seed
tests/                    unit (finance) e integration (Postgres real embutido)
```

## 3. Modelo de dados (resumo)

Todas as tabelas de negócio têm `id uuid`, `business_id`, `created_at`, `updated_at` e
`created_by` quando faz sentido.

| Tabela | Papel |
|---|---|
| `users` | perfil do usuário (id = id do Supabase Auth) |
| `businesses` | empresa: nome, timezone, moeda, locale, plano (`FREE`), limites futuros |
| `business_members` | usuário × empresa × papel (`OWNER, ADMIN, MANAGER, EMPLOYEE, VIEWER`) |
| `document_sequences` | numeração amigável por empresa (`VEN-000001`, `COM-000001`, `DEV-…`) |
| `categories` | categorias de produto |
| `products` | cadastro + **saldo**: `stock_quantity`, `stock_value` (valor contábil do estoque) |
| `product_images` | metadados das fotos (o binário fica no Storage) |
| `suppliers`, `customers` | cadastros |
| `purchases`, `purchase_items` | compras e itens com **custo final rateado** (`landed_total`) |
| `sales`, `sale_items` | vendas e itens com **custo histórico** (`unit_cost_at_sale`, `total_cost`) |
| `inventory_movements` | livro-razão do estoque: `quantity_delta` e `value_delta` com sinal + saldo após |
| `accounts_receivable` | parcelas a receber (vencimento, valor, valor pago, status) |
| `payments` | entradas/saídas de dinheiro (recebimentos, estornos, reembolsos) |
| `returns`, `return_items` | devoluções parciais/totais |
| `expense_categories`, `expenses` | despesas operacionais |
| `attachments` | comprovantes e arquivos genéricos (polimórfico por entidade) |
| `audit_logs` | trilha de auditoria |

Invariante central (testada): para todo produto,
`stock_quantity = Σ quantity_delta` e `stock_value = Σ value_delta` das movimentações.
Isso também permite reconstruir o **capital em estoque em qualquer data passada**.

Vários estoques/lojas no futuro: o saldo sai de `products` para `stock_balances(product_id, location_id)`;
as movimentações já são a fonte da verdade, então a migração é localizada.

## 4. Autenticação

1. Cadastro/login/recuperação via Supabase Auth (`@supabase/ssr`, cookies httpOnly).
2. `middleware` renova a sessão e redireciona rotas privadas para `/login`.
3. No primeiro acesso autenticado, o perfil é criado em `users` (sem trigger em `auth.users`, para portabilidade).
4. Sem empresa → `/onboarding` ("Bem-vindo ao LucroFlow"), que cria `businesses` + `business_members(OWNER)`
   + categorias de despesa padrão, numa transação.
5. Empresa ativa guardada em cookie, **sempre revalidada** contra `business_members` no servidor.

## 5. Estratégia multiempresa (duas camadas)

1. **Aplicação**: toda função de serviço recebe um `ctx { userId, businessId, role }` montado no servidor
   a partir da sessão + membership. `business_id` nunca vem do formulário. Toda query filtra por `business_id`.
2. **Banco (RLS)**: todas as tabelas de negócio têm RLS. As queries da aplicação rodam dentro de transação com
   `SET LOCAL ROLE lucroflow_app` e `set_config('app.user_id', …, true)`; as políticas só liberam linhas de empresas
   onde o usuário é membro. Os papéis `anon`/`authenticated` do Supabase não têm política nenhuma → a API REST
   pública do Supabase não enxerga nada mesmo com a anon key.

Testes de integração verificam que o usuário A não lê nem altera dados da empresa B, mesmo forçando o `business_id`.

## 6. Estoque

- **Custo médio ponderado**, armazenado como *pool de valor*: o produto guarda `stock_quantity` e `stock_value`.
  `custo médio = stock_value / stock_quantity` (derivado, nunca acumulado à parte → sem deriva de arredondamento).
- **Entrada (compra)**: `stock_value += landed_total` do item; `stock_quantity += qtd`.
- **Saída (venda)**: `custo = round(stock_value × qtd / stock_quantity, 2)`; se zerar o estoque, custo = `stock_value` inteiro
  (o resíduo de centavos nunca fica preso). O custo é **gravado no item da venda** e nunca recalculado.
- **Estoque negativo proibido**: validação na transação com `SELECT … FOR UPDATE` + `CHECK (stock_quantity >= 0)` no banco.
- **Tipos de movimentação**: `PURCHASE, PURCHASE_CANCEL, SALE, SALE_CANCEL, RETURN, ADJUSTMENT_IN, ADJUSTMENT_OUT, LOSS,
  COST_ADJUSTMENT, TRANSFER` (TRANSFER reservado para multiestoque).
  - `COST_ADJUSTMENT` *(adicionado)*: soma custo ao estoque sem mudar quantidade — ex.: manutenção de R$150 num aparelho
    (exemplo da seção 23 da especificação).
- **Idade do estoque / tempo até venda**: análise com premissa **FIFO apenas para analytics** (as unidades mais antigas
  saem primeiro), calculada a partir das movimentações reais. O custo contábil continua sendo custo médio.
- FIFO contábil no futuro: o campo `businesses.costing_method` existe; as movimentações já guardam entradas individuais.

## 7. Fórmulas financeiras (fonte única: `src/lib/finance`)

Dinheiro: **`NUMERIC(14,2)` no banco** e `decimal.js` no código (nunca `number` para valores).
Quantidade: `NUMERIC(14,3)` (permite kg/m). Taxas unitárias (custo unitário, custo médio): `NUMERIC(18,6)`,
sempre derivadas de valores em centavos. Arredondamento: *half-up* para 2 casas.

| Conceito | Fórmula |
|---|---|
| Receita de produtos do item | `qtd × preço − desconto do item − desconto global rateado` |
| **Faturamento** (receita) | `Σ receita dos itens + frete cobrado` (decisão D1) |
| CMV | `Σ total_cost` dos itens (custo histórico) |
| **Lucro bruto** | `faturamento − CMV` |
| Custos da venda | `frete pago + taxas + comissão + outras despesas da venda` |
| Lucro da venda | `lucro bruto − custos da venda` |
| **Lucro líquido gerencial** (período) | `Σ lucro das vendas − despesas operacionais − perdas de estoque (LOSS) ∓ devoluções` |
| Margem | `lucro / receita × 100` |
| ROI | `lucro / custo × 100` (custo = CMV, o capital aplicado na mercadoria) |
| Markup | `preço / custo` (mostrado como multiplicador, nunca como margem) |
| Preço p/ margem desejada | `custo / (1 − margem)` |
| Capital em estoque | `Σ stock_value` (não é lucro) |

Validação do exemplo da especificação (teste automatizado): custo 3.500 + 150 manutenção + 50 frete = 3.700;
venda 4.300; taxa 50 → lucro 550; margem 12,79%; ROI 550/3.700 = 14,86%.

**Compras não são despesa**: entram como estoque. Só viram custo quando vendidas (CMV) ou perdidas.

### Rateio (compras e vendas)
- Custos globais da compra (frete + impostos + outros − desconto global) são rateados **proporcionalmente ao valor
  líquido de cada item**; se todos os itens valem 0, proporcional à quantidade.
- Arredondamento pelo **método do maior resto** em centavos: a soma rateada é sempre exatamente igual ao total
  (sem centavos sobrando). Mesma regra para o desconto global da venda.
- Garantia testada: `Σ itens + custos − descontos = total da compra`.

### Caixa ≠ lucro
- Receita é reconhecida na **data comercial da venda** (regime de competência).
- `payments` registra dinheiro que entrou/saiu (com data de pagamento); `accounts_receivable` registra o que falta receber.
- Status do recebível: `PENDING, PARTIAL, PAID, OVERDUE` (OVERDUE = vencido e não pago, calculado pela data da empresa), `CANCELLED`.

## 8. Transações e concorrência

Toda operação crítica é **uma** transação no Postgres:

```
BEGIN
  SET LOCAL ROLE lucroflow_app; set_config('app.user_id'…)
  SELECT … FROM products WHERE id IN (…) ORDER BY id FOR UPDATE   -- trava em ordem fixa (evita deadlock)
  valida estoque / calcula custos no servidor (preços e totais do cliente são recalculados)
  INSERT venda, itens, movimentações, recebíveis, pagamentos
  UPDATE saldos dos produtos
  INSERT audit_log
COMMIT   (qualquer erro → ROLLBACK)
```

Duas vendas simultâneas da última unidade: a segunda espera o lock, relê o saldo e falha com "Estoque insuficiente".
Teste de integração dispara as duas em paralelo contra um Postgres real.

## 9. Cancelamentos e devoluções

- **Cancelar venda**: status `CANCELLED` + `cancelled_at/by/reason`; estoque volta pelo custo histórico gravado
  (`SALE_CANCEL`); parcelas abertas viram `CANCELLED`; valores já recebidos geram estorno (`payments` de saída).
  A venda sai de todos os indicadores (como se não tivesse ocorrido). Nada é apagado.
- **Cancelar compra**: só se nenhum produto da compra teve saída depois dela (senão o custo médio já foi consumido);
  caso contrário, o usuário deve usar ajuste de estoque. Movimentação `PURCHASE_CANCEL`.
- **Devolução parcial/total**: registra produto, quantidade, motivo, reembolso e data. Reduz receita e CMV **na data da devolução** (D2). Se o item volta ao estoque, entra pelo custo histórico da venda (`RETURN`); se não volta (defeito), o custo permanece como CMV. O reembolso primeiro abate parcelas em aberto da venda; o excedente vira pagamento de saída.

## 10. Segurança

- Validação zod no cliente **e** no servidor; preços, custos e totais sempre recalculados no servidor.
- Autorização por papel em cada action (`VIEWER` só lê; venda com prejuízo exige `MANAGER+`).
- RLS (seção 5); Storage em bucket **privado** sem políticas para `anon/authenticated` — todo acesso passa pelo
  servidor (que checa a empresa) e é servido por URL assinada de curta duração.
- Uploads: tipos `image/jpeg|png|webp` (+ `application/pdf` para comprovantes), até 5 MB, conversão para WebP com `sharp`.
- Erros: mensagens amigáveis ao usuário; detalhes técnicos só no log estruturado do servidor (com id de correlação).
- Secrets só em `.env.local` / Vercel; `.env.example` sem valores.

## 11. Roadmap (fases)

1. Fundação: Next.js, TS, Tailwind, shadcn/ui, Drizzle, lint, testes, CI.
2. Banco: schema, migrations, constraints, índices, RLS, seed, testes de integração.
3. Autenticação + onboarding + empresa.
4. Produtos, categorias, fotos, fornecedores, compras, custo médio, movimentações, estoque.
5. Clientes, vendas, pagamentos, custo histórico, lucro, cancelamento, devolução.
6. Despesas, contas a receber, pagamentos parciais.
7. Dashboard com dados reais e comparação de períodos.
8. Relatórios + exportação CSV.
9. Inteligência do negócio (regras sobre dados reais) + alertas.
10. Qualidade: testes, segurança, responsividade, acessibilidade, build.

## 12. Revisão da especificação — conflitos, lacunas e riscos

| # | Ponto | Decisão / tratamento |
|---|---|---|
| R1 | Seção 23 soma "manutenção" ao custo, mas não existe meio de lançar custo num item já em estoque | Criado movimento `COST_ADJUSTMENT` |
| R2 | Lucro líquido com despesas por data vs. vendas por data | Tudo por competência (data comercial) no período |
| R3 | Frete cobrado do cliente: receita ou reembolso? | D1 (confirmada): frete cobrado **entra** no faturamento; frete pago é custo da venda |
| R4 | Devolução: em qual período reduz a receita? | D2 (confirmada): devolução reduz receita/lucro **no período da devolução** |
| R5 | Ajustes de estoque afetam lucro? | `LOSS` reduz o lucro líquido; `ADJUSTMENT_IN/OUT` só corrigem o estoque (não geram lucro/prejuízo) |
| R6 | Cancelar compra depois de vender parte do lote quebraria o custo médio | Bloqueado; usar ajuste |
| R7 | Status `OUT_OF_STOCK` do produto conflita com estoque calculado | Status do cadastro = `ACTIVE/INACTIVE`; "sem estoque" é **derivado** do saldo (evita dado duplicado e divergente). `OUT_OF_STOCK` existe no enum por compatibilidade, mas não é gravado automaticamente |
| R8 | `users` duplicaria `auth.users` | `users` é só o perfil público, chave = id do Auth |
| R9 | Pagamento com cartão é recebido na hora? | O usuário marca cada forma como "recebido agora" ou "a receber em DD/MM" |
| R10 | Período personalizado e timezone | Datas comerciais são `date` no fuso da empresa; `created_at` é `timestamptz` técnico |
| R11 | Supabase local exige Docker (indisponível nesta máquina) | Testes de integração usam Postgres real embutido (`embedded-postgres`) |
| R12 | Concorrência em numeração (`VEN-000001`) | `UPDATE document_sequences … RETURNING` dentro da mesma transação (lock de linha) |

## 13. Decisões confirmadas pelo responsável do produto (02/10/2026)

| Id | Decisão |
|---|---|
| D1 | Frete cobrado do cliente **entra no faturamento**; frete pago é custo da venda. |
| D2 | Devoluções reduzem receita e lucro **na data da devolução** (relatórios fechados não mudam). |
| D3 | Quantidades com **3 casas decimais** (`NUMERIC(14,3)`); unidade `un` é exibida como inteiro. |
| D4 | Venda abaixo do custo: alerta sempre; confirmação permitida a **OWNER, ADMIN e MANAGER**; registrada na auditoria. |
