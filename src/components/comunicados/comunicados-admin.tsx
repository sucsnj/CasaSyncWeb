'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Megaphone, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  createComunicado,
  deleteComunicado,
  resetComunicadoConfirmations,
  setComunicadoPublished,
  updateComunicado,
} from '@/actions/comunicados'
import {
  useComunicadosBundle,
  patchComunicados,
} from '@/hooks/queries/use-comunicados'
import { usePostgresChanges } from '@/hooks/use-postgres-changes'
import { useKeyAction } from '@/hooks/use-key-action'
import { useAppSession } from '@/components/session/app-session'
import { useSettingsBundle } from '@/hooks/queries/use-settings'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'
import { NoHouseCard } from '@/components/session/no-house-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { parseRichText } from '@/components/ui/rich-text'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  COMUNICADO_DEFAULT_TIME,
  COMUNICADO_MAX_DESCRIPTION,
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
  const repeatsLabel =
    comunicado.repeats_total === 0 ? 'Sempre' : `${comunicado.repeats_total}x`
  const intervalLabel = comunicado.repeat_interval_days === 0
    ? 'diário'
    : comunicado.repeat_interval_days === 1
      ? 'semanal'
      : `a cada ${comunicado.repeat_interval_days} dia(s)`
  return { repeatsLabel, intervalLabel }
}

const EMPTY_COMUNICADOS: Comunicado[] = []
const EMPTY_CONFIRMATIONS: Record<string, number> = {}

export function ComunicadosAdmin() {
  const { houseId } = useAppSession()
  const { data, isPending, refetch } = useComunicadosBundle(houseId)
  const { data: settingsData } = useSettingsBundle(houseId)
  const comunicados = data?.comunicados ?? EMPTY_COMUNICADOS
  const confirmations = data?.confirmations ?? EMPTY_CONFIRMATIONS
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const answersMode = settingsData?.comunicadoConfirmation?.mode === 'answers'

  useKeyAction('Escape', () => resetForm(), { enabled: showForm })
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [answers, setAnswers] = useState<string[]>(['', ''])
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [wrongPoints, setWrongPoints] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Comunicado | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [resetTarget, setResetTarget] = useState<Comunicado | null>(null)
  const [resetBusy, setResetBusy] = useState(false)
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})

  const formRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showForm) return
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    titleRef.current?.focus({ preventScroll: true })
  }, [showForm, editingId])

  function upsertComunicado(comunicado: Comunicado) {
    patchComunicados(queryClient, houseId, (bundle) => {
      const exists = bundle.comunicados.some((item) => item.id === comunicado.id)
      return {
        comunicados: exists
          ? bundle.comunicados.map((item) =>
            item.id === comunicado.id ? comunicado : item
          )
          : [comunicado, ...bundle.comunicados],
        confirmations: exists
          ? bundle.confirmations
          : { ...bundle.confirmations, [comunicado.id]: 0 },
      }
    })
  }

  function removeComunicado(id: string) {
    patchComunicados(queryClient, houseId, (bundle) => ({
      comunicados: bundle.comunicados.filter((item) => item.id !== id),
      confirmations: Object.fromEntries(
        Object.entries(bundle.confirmations).filter(([key]) => key !== id)
      ),
    }))
  }

  // Realtime: o ADMIN (em outra aba/desktop) publica/edita/exclui → a lista
  // desta tela acompanha sem refresh manual.
  usePostgresChanges<Comunicado>({
    table: 'comunicados',
    filter: `house_id=eq.${houseId ?? 'none'}`,
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
    setAnswers(
      comunicado.confirmation_answers && comunicado.confirmation_answers.length > 0
        ? [...comunicado.confirmation_answers]
        : ['', '']
    )
    setCorrectIndex(comunicado.confirmation_correct_index ?? null)
    setWrongPoints(comunicado.confirmation_wrong_points ?? 0)
    setFormError(null)
    setShowForm(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setAnswers(['', ''])
    setCorrectIndex(null)
    setWrongPoints(0)
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
        ...(answersMode
          ? {
              confirmationAnswers: answers,
              confirmationCorrectIndex: correctIndex,
              confirmationWrongPoints: wrongPoints,
            }
          : {}),
      }

      if (editingId) {
        const res = await updateComunicado(editingId, payload)
        if (!res.ok) {
          setFormError(res.error)
          return
        }
        if (res.data?.comunicado) {
          upsertComunicado(res.data.comunicado)
          toast.success(res.message)
        }
      } else {
        const res = await createComunicado(payload)
        if (!res.ok) {
          setFormError(res.error)
          return
        }
        if (res.data?.comunicado) {
          upsertComunicado(res.data.comunicado)
          toast.success(res.message)
        }
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
        setPublishErrors((prev) => ({ ...prev, [comunicado.id]: res.error }))
        toast.error(res.error)
        return
      }
      setPublishErrors((prev) => {
        const next = { ...prev }
        delete next[comunicado.id]
        return next
      })
      upsertComunicado({ ...comunicado, published: !comunicado.published })
      toast.success(res.message)
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao publicar:', err)
      toast.error('Falha ao alternar a publicação.')
    }
  }

  async function handleReset() {
    if (!resetTarget || resetBusy) return
    setResetBusy(true)
    try {
      const res = await resetComunicadoConfirmations(resetTarget.id)
      if (!res.ok) {
        toast.error(res.error)
        setResetTarget(null)
        return
      }
      patchComunicados(queryClient, houseId, (bundle) => ({
        comunicados: bundle.comunicados,
        confirmations: { ...bundle.confirmations, [resetTarget.id]: 0 },
      }))
      toast.success(res.message ?? 'Contagem zerada.')
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao resetar:', err)
      toast.error('Falha ao zerar as confirmações.')
    } finally {
      setResetTarget(null)
      setResetBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleteBusy) return
    setDeleteBusy(true)
    try {
      const res = await deleteComunicado(deleteTarget.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      removeComunicado(deleteTarget.id)
      toast.success(res.message ?? 'Comunicado excluído.')
    } catch (err) {
      console.error('[COMUNICADOS] Falha ao excluir:', err)
      toast.error('Falha ao excluir o comunicado.')
    } finally {
      setDeleteTarget(null)
      setDeleteBusy(false)
    }
  }

  const publishedCount = comunicados.filter((comunicado) => comunicado.published).length
  const draftCount = comunicados.length - publishedCount

  if (!houseId) {
    return (
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
          <p className="text-sm font-medium text-white/80">Comunicados</p>
          <h1 className="text-2xl font-bold tracking-tight">Avisos da casa</h1>
          <p className="text-sm text-white/85">
            Selecione uma casa para gerenciar os avisos.
          </p>
        </header>
        <NoHouseCard role="ADMIN" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
        <p className="text-sm font-medium text-white/80">Comunicados</p>
        <h1 className="text-2xl font-bold tracking-tight">Avisos da casa</h1>
        <p className="text-sm text-white/85">
          Os dependentes confirmam a leitura na tela de entrada deles — uma a
          uma, até esgotar as repetições agendadas.
        </p>
      </header>

      {isPending && !data ? (
        <PageSkeleton hero={false} cards={3} />
      ) : !data ? (
        <QueryError onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {publishedCount} publicado{publishedCount === 1 ? '' : 's'}
              </span>
              {draftCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {draftCount} rascunho{draftCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <Button onClick={startCreate}>
              <Plus className="size-4" />
              Novo comunicado
            </Button>
          </div>

          <div ref={formRef} className="scroll-mt-24">
            {showForm ? (
            <Card className="relative">
              <CardHeader>
                <CardTitle>{editingId ? 'Editar comunicado' : 'Novo comunicado'}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-3 top-3"
                  onClick={resetForm}
                  aria-label="Fechar"
                >
                  <X className="size-4" />
                </Button>
              </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {formError ? (
                      <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {formError}
                      </p>
                    ) : null}
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-700">Título</span>
                      <Input
                        ref={titleRef}
                        value={form.title}
                        onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                        maxLength={120}
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-700">Descrição</span>
                      <RichTextEditor
                        name="description"
                        value={form.description}
                        onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
                        limit={COMUNICADO_MAX_DESCRIPTION}
                        placeholder="Ex.: prova de matemática na sexta…"
                        rows={3}
                      />
                    </label>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-slate-700">Repetições</span>
                        <Input type="number" min={0} max={COMUNICADO_MAX_REPEATS} value={form.repeatsTotal} onChange={(event) => setForm((prev) => ({ ...prev, repeatsTotal: Number(event.target.value) || 0 }))} />
                        <span className="text-xs text-slate-500">0 = sempre visível</span>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-slate-700">Intervalo (dias)</span>
                        <Input type="number" min={0} max={COMUNICADO_MAX_INTERVAL_DAYS} value={form.repeatIntervalDays} onChange={(event) => setForm((prev) => ({ ...prev, repeatIntervalDays: Number(event.target.value) || 0 }))} />
                        <span className="text-xs text-slate-500">
                          0 = a cada dia agendado
                        </span>
                      </label>
                    </div>
                    <fieldset className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-slate-700">Dias da semana</span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMUNICADO_SHORT_DAY_LABELS.map((label, day) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            aria-pressed={form.weekdays.includes(day)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${form.weekdays.includes(day)
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="flex flex-col gap-1.5 sm:max-w-48">
                      <span className="text-sm font-medium text-slate-700">Horário</span>
                      <input type="time" value={form.repeatTime} onChange={(event) => setForm((prev) => ({ ...prev, repeatTime: event.target.value }))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500" />
                    </label>
                    {answersMode ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <span className="text-sm font-medium text-slate-700">
                          Respostas (mínimo 2, marque uma como correta)
                        </span>
                        {answers.map((answer, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <Input
                              value={answer}
                              onChange={(event) => {
                                const next = [...answers]
                                next[index] = event.target.value
                                setAnswers(next)
                              }}
                              placeholder={`Resposta ${index + 1}`}
                            />
                            <label className="flex items-center gap-1 text-xs text-slate-600">
                              <input
                                type="radio"
                                name="correct-answer"
                                checked={correctIndex === index}
                                onChange={() => setCorrectIndex(index)}
                              />
                              Correta
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const next = answers.filter((_, i) => i !== index)
                                setAnswers(next.length >= 2 ? next : [...next, ''])
                                if (correctIndex === index) setCorrectIndex(null)
                                else if (correctIndex !== null && correctIndex > index) setCorrectIndex(correctIndex - 1)
                              }}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setAnswers([...answers, ''])}
                        >
                          Adicionar resposta
                        </Button>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-medium text-slate-700">
                            Pontos subtraídos por erro
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={wrongPoints}
                            onChange={(event) => setWrongPoints(Number(event.target.value) || 0)}
                          />
                        </label>
                      </div>
                    ) : null}
                    <Button type="submit" disabled={busy}>
                      {busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar comunicado'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            ) : null}
          </div>

          {comunicados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <Megaphone className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="font-medium text-slate-700">
                Nenhum comunicado ainda.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Crie o primeiro aviso — aparece na entrada dos dependentes até
                que confirmem leitura.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {comunicados.map((comunicado) => {
                const total = confirmations[comunicado.id] ?? 0
                return (
                  <li
                    key={comunicado.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${comunicado.published
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                              }`}
                          >
                            {comunicado.published ? 'Publicado' : 'Rascunho'}
                          </span>
                          <span className="text-xs text-slate-500">
                            {scheduleSummary(comunicado).repeatsLabel} ·{' '}
                            {scheduleSummary(comunicado).intervalLabel} ·{' '}
                            {String(comunicado.repeat_time).slice(0, 5)}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800">{comunicado.title}</p>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
                          {parseRichText(comunicado.description)}
                        </div>
                        {total > 0 ? (
                          <p className="mt-1.5 text-xs font-medium text-emerald-700">
                            {total} {total === 1 ? 'confirmação' : 'confirmações'}
                          </p>
                        ) : null}
                        {publishErrors[comunicado.id] ? (
                          <p className="mt-1.5 text-xs font-medium text-red-600">
                            {publishErrors[comunicado.id]}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => startEdit(comunicado)}>
                          <Pencil className="size-4" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void handleTogglePublished(comunicado)}>
                          {comunicado.published ? 'Despublicar' : 'Publicar'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setResetTarget(comunicado)}>
                          <RotateCcw className="size-4" />
                          Zerar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(comunicado)}>
                          <Trash2 className="size-4" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <Modal
            open={Boolean(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
            title="Excluir comunicado"
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-700">
                Excluir <strong>{deleteTarget?.title}</strong>? As confirmações já
                registradas também são apagadas.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteBusy}>
                  {deleteBusy ? 'Excluindo...' : 'Excluir'}
                </Button>
              </div>
            </div>
          </Modal>

          <Modal
            open={Boolean(resetTarget)}
            onClose={() => setResetTarget(null)}
            title="Zerar confirmações"
          >
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-700">
                Zerar as contagens de <strong>{resetTarget?.title}</strong>? Os
                dependentes verão o aviso de novo até esgotar as repetições.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setResetTarget(null)}>
                  Cancelar
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={resetBusy}>
                  {resetBusy ? 'Zerando...' : 'Zerar'}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}
