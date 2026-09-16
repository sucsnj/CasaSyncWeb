import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: 'CasaSync',
    template: '%s | CasaSync',
  },
  description: 'Gestão de tarefas, pontos e recompensas para a sua casa.',
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body className="min-h-svh bg-slate-50 text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
