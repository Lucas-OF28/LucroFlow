import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LucroFlow",
    short_name: "LucroFlow",
    description: "Controle seu estoque. Entenda seu lucro.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#0f8f6a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova venda", url: "/vendas/nova" },
      { name: "Nova compra", url: "/compras/nova" },
      { name: "Estoque", url: "/estoque" },
    ],
  };
}
