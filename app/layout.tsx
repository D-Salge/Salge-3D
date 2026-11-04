import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./studio-system.css";
import "./operations-design.css";
import { themeInitializationScript } from "@/public/theme-transition.mjs";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Salge 3D — Gestão de Orçamentos",
    template: "%s · Salge 3D",
  },
  description:
    "Sistema de gestão e precificação de pedidos de impressão 3D. Calcule custos de material, reserva de máquina e margem de lucro.",
  keywords: ["impressão 3D", "orçamento", "gestão", "filamento", "PLA", "PETG"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning className={`${inter.variable} h-full`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} /></head>
      <body className="min-h-full antialiased font-sans bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
