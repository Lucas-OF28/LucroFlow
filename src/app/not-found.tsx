import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <p className="text-muted-foreground">Página ou registro não encontrado.</p>
      <Button asChild><Link href="/">Voltar ao início</Link></Button>
    </div>
  );
}
