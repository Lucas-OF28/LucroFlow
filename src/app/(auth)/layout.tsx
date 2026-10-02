import { Logo } from "@/components/shared/logo";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/40 px-4 py-10">
      <div className="text-center">
        <Logo className="justify-center" />
        <p className="mt-2 text-sm text-muted-foreground">Controle seu estoque. Entenda seu lucro.</p>
      </div>
      <div className="w-full max-w-sm">
        {isSupabaseConfigured() ? (
          children
        ) : (
          <div role="alert" className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-medium">Configuração pendente</p>
            <p className="mt-1 text-muted-foreground">
              Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> em <code>.env.local</code> (veja o README).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
