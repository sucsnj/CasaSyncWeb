import { AppShell } from '@/components/session/app-shell'

/**
 * Shell estático do grupo `(app)`: sem `await` no servidor e sem dados na
 * primeira pintura — a navegação, sino e overlays montam client-side (AppShell
 * lê a sessão do storage e busca o bundle do shell pelo query cache, sem
 * round-trip na navegação). As rotas da árvore podem ser pré-renderizadas.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <AppShell>{children}</AppShell>
    </div>
  )
}
