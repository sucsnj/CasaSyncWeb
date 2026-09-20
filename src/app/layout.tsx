import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { Toaster } from "sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: 'CasaSync',
    template: 'CasaSync | %s',
  },
  description: 'Gestão de tarefas, pontos e recompensas para a sua casa.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CasaSync',
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1d4ed8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)}>
      <body className="min-h-svh bg-slate-100 text-slate-800 antialiased">
        {children}
        <ServiceWorkerRegistration />
        <Toaster
          position="bottom-right"
          theme="system"
          toastOptions={{
            classNames: {
              toast: 'rounded-xl border bg-white/95 backdrop-blur-sm shadow-lg',
              description: 'text-sm text-slate-600',
              actionButton: 'rounded-lg bg-slate-100 hover:bg-slate-200',
              cancelButton: 'rounded-lg bg-slate-100 hover:bg-slate-200',
            },
          }}
        />
      </body>
    </html>
  );
}
