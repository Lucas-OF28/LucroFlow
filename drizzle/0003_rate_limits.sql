-- Limite de tentativas (login, cadastro, recuperação de senha, uploads, exportações).
-- Fica no schema `app` (não exposto pela API pública do Supabase) e só é acessível pelo dono das tabelas
-- e pela função abaixo. As chaves são hashes (o IP/e-mail original não é armazenado).

CREATE TABLE IF NOT EXISTS app.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL
);
--> statement-breakpoint
REVOKE ALL ON app.rate_limits FROM PUBLIC;
--> statement-breakpoint

-- Janela fixa: retorna true se a ação está permitida (contador dentro do limite).
CREATE OR REPLACE FUNCTION app.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = app, pg_temp
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO app.rate_limits AS r (key, window_start, hits)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE r.window_start END
  RETURNING hits INTO v_hits;

  -- limpeza oportunista de janelas antigas (~1% das chamadas)
  IF random() < 0.01 THEN
    DELETE FROM app.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_hits <= p_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.rate_limit_hit(text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.rate_limit_hit(text, integer, integer) TO lucroflow_app;
