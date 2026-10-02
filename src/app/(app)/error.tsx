"use client";

import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

/** Erro inesperado: mensagem amigável; detalhes técnicos ficam no log do servidor (digest). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar esta página."
      description={error.digest ? `Tente novamente. Se persistir, informe o código ${error.digest}.` : "Tente novamente em instantes."}
      retry={<Button onClick={reset}>Tentar novamente</Button>}
    />
  );
}
