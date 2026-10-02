-- LucroFlow — segurança no banco (docs/ARQUITETURA.md §5)
--
-- 1. Papel `lucroflow_app`: a aplicação executa TODAS as queries de negócio com
--    `SET LOCAL ROLE lucroflow_app` + `set_config('app.user_id', <uuid>, true)` dentro da transação.
-- 2. RLS em todas as tabelas: só linhas de empresas onde o usuário é membro ativo.
-- 3. Tabelas financeiras são append-only para a aplicação (sem DELETE; livro-razão e auditoria sem UPDATE).
-- 4. Papéis públicos do Supabase (anon/authenticated) não recebem nenhuma política → a API REST
--    do Supabase não expõe dados de negócio, mesmo com a anon key.
-- Portável: não depende de auth.uid() nem de nada específico do Supabase.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lucroflow_app') THEN
    CREATE ROLE lucroflow_app NOLOGIN NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT lucroflow_app TO CURRENT_USER;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO lucroflow_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lucroflow_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.is_member(p_business_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = p_business_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'ACTIVE'
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.has_role(p_business_id uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_members m
    WHERE m.business_id = p_business_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'ACTIVE'
      AND m.role::text = ANY (p_roles)
  )
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.shares_business(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_user_id = app.current_user_id() OR EXISTS (
    SELECT 1
    FROM public.business_members mine
    JOIN public.business_members other ON other.business_id = mine.business_id
    WHERE mine.user_id = app.current_user_id() AND mine.status = 'ACTIVE'
      AND other.user_id = p_user_id
  )
$$;
--> statement-breakpoint

-- Onboarding: cria empresa + vínculo OWNER + categorias de despesa padrão, atomicamente.
-- SECURITY DEFINER porque o usuário ainda não é membro (RLS bloquearia o INSERT … RETURNING).
CREATE OR REPLACE FUNCTION app.create_business(p_name text, p_timezone text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_business uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_user) THEN
    RAISE EXCEPTION 'user profile missing' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'business name required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'invalid timezone' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.businesses (name, timezone, created_by)
  VALUES (trim(p_name), p_timezone, v_user)
  RETURNING id INTO v_business;

  INSERT INTO public.business_members (business_id, user_id, role, status)
  VALUES (v_business, v_user, 'OWNER', 'ACTIVE');

  INSERT INTO public.expense_categories (business_id, name, is_default)
  SELECT v_business, c, true
  FROM unnest(ARRAY['Combustível','Frete','Embalagem','Marketing','Aluguel','Funcionários',
                    'Software','Internet','Manutenção','Impostos','Taxas','Outras']) AS c;

  RETURN v_business;
END
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.is_member(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.has_role(uuid, text[]) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.shares_business(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.create_business(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.is_member(uuid), app.has_role(uuid, text[]),
  app.shares_business(uuid), app.create_business(text, text) TO lucroflow_app;
--> statement-breakpoint

-- ─── Privilégios da aplicação ─────────────────────────────────────────────
-- Cadastros: leitura/escrita, sem DELETE (arquivamento por archived_at).
GRANT SELECT, INSERT, UPDATE ON categories, suppliers, customers, products, expense_categories, expenses,
  purchases, sales, accounts_receivable, document_sequences TO lucroflow_app;
--> statement-breakpoint
-- Imutáveis depois de criados (livro-razão, itens, pagamentos, devoluções, auditoria).
GRANT SELECT, INSERT ON purchase_items, sale_items, inventory_movements, payments, returns, return_items, audit_logs
  TO lucroflow_app;
--> statement-breakpoint
-- Metadados de arquivos podem ser removidos (o arquivo também é removido do Storage).
GRANT SELECT, INSERT, UPDATE, DELETE ON product_images, attachments TO lucroflow_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users, user_preferences TO lucroflow_app;
--> statement-breakpoint
GRANT SELECT, UPDATE ON businesses TO lucroflow_app;
--> statement-breakpoint
GRANT SELECT ON business_members TO lucroflow_app;
--> statement-breakpoint

-- ─── Row Level Security ───────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','suppliers','customers','products','product_images',
    'purchases','purchase_items','sales','sale_items','returns','return_items',
    'inventory_movements','accounts_receivable','payments',
    'expense_categories','expenses','attachments','audit_logs','document_sequences'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO lucroflow_app
         USING (app.is_member(business_id)) WITH CHECK (app.is_member(business_id))', t);
  END LOOP;
END
$$;
--> statement-breakpoint

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON public.users FOR SELECT TO lucroflow_app USING (app.shares_business(id));
--> statement-breakpoint
CREATE POLICY users_insert_self ON public.users FOR INSERT TO lucroflow_app WITH CHECK (id = app.current_user_id());
--> statement-breakpoint
CREATE POLICY users_update_self ON public.users FOR UPDATE TO lucroflow_app
  USING (id = app.current_user_id()) WITH CHECK (id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_preferences_self ON public.user_preferences FOR ALL TO lucroflow_app
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());
--> statement-breakpoint

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY businesses_select ON public.businesses FOR SELECT TO lucroflow_app USING (app.is_member(id));
--> statement-breakpoint
CREATE POLICY businesses_update ON public.businesses FOR UPDATE TO lucroflow_app
  USING (app.has_role(id, ARRAY['OWNER','ADMIN'])) WITH CHECK (app.has_role(id, ARRAY['OWNER','ADMIN']));
--> statement-breakpoint

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY business_members_select ON public.business_members FOR SELECT TO lucroflow_app
  USING (user_id = app.current_user_id() OR app.is_member(business_id));
--> statement-breakpoint

-- ─── Supabase: fecha a API pública (PostgREST) para tabelas de negócio ───────
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
    END IF;
  END LOOP;
END
$$;
