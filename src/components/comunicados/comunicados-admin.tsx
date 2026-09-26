'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  createComunicado,
  deleteComunicado,
  setComunicadoPublished,
  updateComunicado,
} from '@/actions/comunicados'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  COMUNICADO_DEFAULT_TIME,
  COMUNICADO_MAX_INTERVAL_DAYS,
  COMUNICADO_MAX_REPEATS,
  COMUNICADO_SHORT_DAY_LABELS,
  formatComunicadoTime,
  type Comunicado,
} from '@/utils/comunicados'

type FormState = {
  title: string
  description: string
  repeatsTotal: number
  repeatIntervalDays: number
  weekdays: number[]
  repeatTime: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  repeatsTotal: 1,
  repeatIntervalDays: 0,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  repeatTime: COMUNICADO_DEFAULT_TIME,
}

function scheduleSummary(comunicado: Comunicado): {
  repeatsLabel: string
  intervalLabel: string
} {
  return {
    repeatsLabel: `${comunicado.repeats_total}× por dependente`,
    intervalLabel:
      comunicado.repeat_interval_days > 0
        ? `a cada ${comunicado.repeat_interval_days} dia${comunicado.repeat_interval_days > 1 ? 's' : ''}`
        : 'sem período fixo',
  }
}

export function ComunicadosAdmin({
  houseId,
  initialComunicados,
  initialConfirmations,
}: {
  houseId: string
  initialComunicados: Comunicado[]
  initialConfirmations: Record<string, number>
}) {
  const [comunicados, setComunicados] = useState(initialComunicados)
  const [confirmations, setConfirmations] = useState(initialConfirmations)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Comunicado | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  function upsertComunicado(comunicado: Comunicado) {
    setComunicados((prev) => {
      const exists = prev.some((item) => item.id === comunicado.id)
      return exists
        ? prev.map((item) => (item.id === comunicado.id ? comunicado : item))
        : [comunicado, ...prev]
    })
  }

  function removeComunicado(id: string) {
    setComunicados((prev) => prev.filter((item) => item.id !== id))
  }

  // Realtime: o ADMIN (em outra aba/desktop) publica/edita/exclui → a lista
  // desta tela acompanha sem refresh manual.
  usePostgresChanges<Comunicado>({
    table: 'comunicados',
    filter: `house_id=eq.${houseId}`,
    onUpsert: upsertComunicado,
    onDelete: removeComunicado,
  })

  function startCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  function startEdit(comunicado: Comunicado) {
    setEditingId(comunicado.id)
    setForm({
      title: comunicado.title,
      description: comunicado.description,
      repeatsTotal: comunicado.repeats_total,
      repeatIntervalDays: comunicado.repeat_interval_days,
      weekdays: comunicado.repeat_weekdays,
      repeatTime: formatComunicadoTime(comunicado.repeat_time),
    })
    setFormError(null)
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(false)
  }

  function toggleWeekday(day: number) {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(day)
        ? prev.weekdays.filter((d) => d !== day)
        : [...prev.weekdays, day].sort(),
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFormError(null)
    try {
      const payload = {
        title: form.title,
        description: form.description,
        repeatsTotal: form.repeatsTotal,
        repeatIntervalDays: form.repeatIntervalDays,
        repeatWeekdays: form.weekdays,
        repeatTime: form.repeatTime,
      }

      if (editingId) {
        const res = await updateComunicado(editingId, payload)
        if (!res.ok) {
          setFormError(res.error)
          return
        }
        toast.success(res.message)
      } else {
        const res = await createComunicado(payload)
        if (!res.ok) {
          setFormError(res.error)
          return
        }
        if (res.data?.comunicado) {
          upsertComunicado(res.data.comunicado)
          setConfirmations((prev) => ({ ...prev, [res.data!.comunicado.id]: 0 }))
        }
        toast.success(res.message)
      }
      resetForm()
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao salvar:', err)
      setFormError('Falha inesperada. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function handleTogglePublished(comunicado: Comunicado) {
    try {
      const res = await setComunicadoPublished(comunicado.id, !comunicado.published)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      upsertComunicado({ ...comunicado, published: !comunicado.published })
      toast.success(res.message)
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao publicar:', err)
      toast.error('Falha ao alternar a publicação.')
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    try {
      const res = await deleteComunicado(deleteTarget.id)
      if (!res.ok) {
        toast.error(res.error)
        setDeleteTarget(null)
        return
      }
      removeComunicado(deleteTarget.id)
      setConfirmations((prev) => {
        const next = { ...prev }
        delete next[deleteTarget.id]
        return next
      })
      toast.success(res.message)
      setDeleteTarget(null)
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao excluir:', err)
      toast.error('Falha ao excluir o comunicado.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">
            Avisos da casa
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Comunicados
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publique avisos que todos os dependentes precisam confirmar — na
            hora, ou na próxima vez que abrirem o app.
          </p>
        </div>
        <Button
          variant={showForm ? 'outline' : 'default'}
          onClick={() => (showForm ? resetForm() : startCreate())}
          className="sm:self-start"
        >
          <Plus className="size-4" />
          {showForm ? 'Cancelar' : 'Novo comunicado'}
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="size-5 text-violet-600" />
              {editingId ? 'Editar comunicado' : 'Novo comunicado'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="comunicado-title">
                  Título
                </label>
                <Input
                  id="comunicado-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Ex.: Reunião de família no sábado"
                  maxLength={120}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700" htmlFor="comunicado-description">
                  Descrição
                </label>
                <textarea
                  id="comunicado-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="O que os dependentes precisam ler e confirmar?"
                  maxLength={500}
                  required
                  rows={3}
                  className="min-h-12 w-full rounded-xl border border-input bg-white px-3 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700" htmlFor="comunicado-repeats">
                    Vezes por dependente (1–{COMUNICADO_MAX_REPEATS})
                  </label>
                  <Input
                    id="comunicado-repeats"
                    type="number"
                    min={1}
                    max={COMUNICADO_MAX_REPEATS}
                    value={form.repeatsTotal}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        repeatsTotal: Number(event.target.value),
                      }))
                    }
                    required
                  />
                  <p className="text-xs text-slate-400">
                    Quantas confirmações o dependente precisa dar.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700" htmlFor="comunicado-interval">
                    Período entre repetições (dias)
                  </label>
                  <Input
                    id="comunicado-interval"
                    type="number"
                    min={0}
                    max={COMUNICADO_MAX_INTERVAL_DAYS}
                    value={form.repeatIntervalDays}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        repeatIntervalDays: Number(event.target.value),
                      }))
                    }
                    required
                  />
                  <p className="text-xs text-slate-400">
                    0 = sem período fixo (só vale a agenda de dias/horário).
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Dias da semana
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMUNICADO_SHORT_DAY_LABELS.map((label, day) => {
                    const selected = form.weekdays.includes(day)
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(day)}
                        aria-pressed={selected}
                        className={
                          selected
                            ? 'min-h-10 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white'
                            : 'min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-500 hover:bg-slate-50'
                        }
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-xs text-slate-400">
                  Dias em que o comunicado volta a aparecer. Ao menos um obrigatório.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 sm:max-w-52">
                <label className="text-sm font-medium text-slate-700" htmlFor="comunicado-time">
                  Horário
                </label>
                <Input
                  id="comunicado-time"
                  type="time"
                  value={form.repeatTime}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, repeatTime: event.target.value }))
                  }
                  required
                />
              </div>

              {formError ? (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {formError}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" disabled={busy} className="sm:flex-1">
                  {busy
                    ? 'Salvando…'
                    : editingId
                      ? 'Salvar alterações'
                      : 'Criar rascunho'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={busy}
                >
                  Cancelar
                </Button>
              </div>

              {!editingId ? (
                <p className="text-xs text-slate-400">
                  O rascunho fica invisível aos dependentes até você tocar em
                  “Publicar”.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {comunicados.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Megaphone className="size-6" />
              </span>
              <p className="font-semibold text-slate-700">Nenhum comunicado ainda</p>
              <p className="max-w-sm text-sm text-slate-500">
                Crie um aviso e publique. Os dependentes confirmam na hora ou na
                próxima abertura do app.
              </p>
            </CardContent>
          </Card>
        ) : (
          comunicados.map((comunicado) => {
            const summary = scheduleSummary(comunicado)
            return (
              <Card key={comunicado.id}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span
                        className={
                          comunicado.published
                            ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600'
                        }
                      >
                        {comunicado.published ? 'Publicado' : 'Rascunho'}
                      </span>
                      <p className="min-w-0 truncate font-semibold text-slate-900">
                        {comunicado.title}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTogglePublished(comunicado)}
                      >
                        <Megaphone className="size-4" />
                        {comunicado.published ? 'Despublicar' : 'Publicar'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(comunicado)}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(comunicado)}
                      >
                        <Trash2 className="size-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm text-slate-600">
                    {comunicado.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-lg bg-sky-100 px-2 py-1 font-medium text-sky-700">
                      {summary.repeatsLabel}
                    </span>
                    <span className="rounded-lg bg-sky-100 px-2 py-1 font-medium text-sky-700">
                      {summary.intervalLabel}
                    </span>
                    <span className="rounded-lg bg-sky-100 px-2 py-1 font-medium text-sky-700">
                      {comunicado.repeat_weekdays
                        .map((day) => COMUNICADO_SHORT_DAY_LABELS[day])
                        .join(', ')}
                    </span>
                    <span className="rounded-lg bg-sky-100 px-2 py-1 font-medium text-sky-700">
                      às {formatComunicadoTime(comunicado.repeat_time)}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-1 font-medium text-slate-600">
                      {confirmations[comunicado.id] ?? 0} confirmações
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Excluir comunicado"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Excluir “{deleteTarget?.title}” remove o comunicado e todas as
            confirmações já feitas pelos dependentes. Esta ação não pode ser
            desfeita.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="destructive"
              disabled={deleteBusy}
              onClick={handleDelete}
              className="sm:flex-1"
            >
              {deleteBusy ? 'Excluindo…' : 'Excluir'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteBusy}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}