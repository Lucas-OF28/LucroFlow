/** Resultado serializável de uma Server Action (compartilhado entre servidor e cliente). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      details?: Record<string, unknown>;
    };
