import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ServiceWorkerRegister } from "@/components/shared/sw-register";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "LucroFlow", template: "%s · LucroFlow" },
  description: "Controle seu estoque. Entenda seu lucro.",
  applicationName: "LucroFlow",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LucroFlow", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-48.png", sizes: "48x48" }], apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonce da CSP (gerado no proxy). Ler os cabeçalhos torna todas as páginas dinâmicas, então todo HTML recebe o nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster richColors closeButton position="top-center" />
            <ServiceWorkerRegister />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
