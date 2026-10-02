import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Download de arquivo gerado por Route Handler (não é navegação de página, por isso <a>). */
export function DownloadLink({ href, children, size }: { href: string; children: ReactNode; size?: "sm" | "default" }) {
  return (
    <Button variant="outline" size={size} asChild>
      <a href={href} download>
        <Download className="size-4" aria-hidden /> {children}
      </a>
    </Button>
  );
}
