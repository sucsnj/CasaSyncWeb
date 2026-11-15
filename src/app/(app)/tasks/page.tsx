import type { Metadata } from 'next'
import { TasksScreen } from '@/components/screens/tasks-screen'

export const metadata: Metadata = {
  title: 'Tarefas',
}

export default function TasksPage() {
  return (
    <main className="flex flex-col gap-6">
      <TasksScreen />
    </main>
  )
}
