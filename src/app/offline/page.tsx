import { WifiOff } from "lucide-react";
import { Logo } from "@/components/shared/logo";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <WifiOff className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">Você está sem conexão.</p>
      <p className="max-w-xs text-sm text-muted-foreground">Para manter os números corretos, o LucroFlow só registra vendas e compras online. Reconecte e tente novamente.</p>
    </div>
  );
}
