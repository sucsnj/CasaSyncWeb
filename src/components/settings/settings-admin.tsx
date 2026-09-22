'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BellRing,
  CalendarClock,
  Clock3,
  Coins,
  MessageSquare,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { updateHouseSettings } from '@/actions/settings'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  ExtensionRulesSettings,
  NotificationRetentionSettings,
  QuickMessageSettings,
  RewardPricingSettings,
  TaskSlaSettings,
} from '@/utils/settings'

type SettingsAdminProps = {
  rewardPricing: RewardPricingSettings
  quickMessage: QuickMessageSettings
  taskSla: TaskSlaSettings
  extensionRules: ExtensionRulesSettings
  notificationRetention: NotificationRetentionSettings
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 active:scale-95',
        checked ? 'bg-blue-600' : 'bg-slate-300'
      )}
    >
      <span
        className={cn(
          'inline-block size-5 translate-x-0.5 transform rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-[22px]'
        )}
      />
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {suffix ? (
          <span className="ml-1 text-xs font-normal text-slate-400">
            {suffix}
          </span>
        ) : null}
      </span>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        className="min-h-10 text-sm"
      />
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function SettingsAdmin({
  rewardPricing,
  quickMessage,
  taskSla,
  extensionRules,
  notificationRetention,
}: SettingsAdminProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [pricing, setPricing] = useState<RewardPricingSettings>(rewardPricing)
  const [pricingError, setPricingError] = useState<string | null>(null)
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null)

  const [quick, setQuick] = useState<QuickMessageSettings>(quickMessage)
  const [quickError, setQuickError] = useState<string | null>(null)
  const [quickSuccess, setQuickSuccess] = useState<string | null>(null)

  const [sla, setSla] = useState<TaskSlaSettings>(taskSla)
  const [slaError, setSlaError] = useState<string | null>(null)
  const [slaSuccess, setSlaSuccess] = useState<string | null>(null)

  const [extensions, setExtensions] =
    useState<ExtensionRulesSettings>(extensionRules)
  const [extensionsError, setExtensionsError] = useState<string | null>(null)
  const [extensionsSuccess, setExtensionsSuccess] = useState<string | null>(null)

  const [retention, setRetention] =
    useState<NotificationRetentionSettings>(notificationRetention)
  const [retentionError, setRetentionError] = useState<string | null>(null)
  const [retentionSuccess, setRetentionSuccess] = useState<string | null>(null)

  function savePricing() {
    setPricingError(null)
    setPricingSuccess(null)

    startTransition(async () => {
      const result = await updateHouseSettings('reward_pricing', {
        ...pricing,
      })
      if (!result.ok) {
        setPricingError(result.error)
        toast.error(result.error)
        return
      }
      setPricingSuccess(result.message ?? 'Configurações salvas.')
      toast.success(result.message ?? 'Configurações salvas.')
      router.refresh()
    })
  }

  function saveQuick() {
    setQuickError(null)
    setQuickSuccess(null)

    startTransition(async () => {
      const result = await updateHouseSettings('quick_message', { ...quick })
      if (!result.ok) {
        setQuickError(result.error)
        toast.error(result.error)
        return
      }
      setQuickSuccess(result.message ?? 'Configurações salvas.')
      toast.success(result.message ?? 'Configurações salvas.')
      router.refresh()
    })
  }

  function saveSla() {
    setSlaError(null)
    setSlaSuccess(null)

    startTransition(async () => {
      const result = await updateHouseSettings('task_sla', { ...sla })
      if (!result.ok) {
        setSlaError(result.error)
        toast.error(result.error)
        return
      }
      setSlaSuccess(result.message ?? 'Configurações salvas.')
      toast.success(result.message ?? 'Configurações salvas.')
      router.refresh()
    })
  }

  function saveExtensions() {
    setExtensionsError(null)
    setExtensionsSuccess(null)

    startTransition(async () => {
      const result = await updateHouseSettings('extension_rules', {
        ...extensions,
      })
      if (!result.ok) {
        setExtensionsError(result.error)
        toast.error(result.error)
        return
      }
      setExtensionsSuccess(result.message ?? 'Configurações salvas.')
      toast.success(result.message ?? 'Configurações salvas.')
      router.refresh()
    })
  }

  function saveRetention() {
    setRetentionError(null)
    setRetentionSuccess(null)

    startTransition(async () => {
      const result = await updateHouseSettings('notification_retention', {
        ...retention,
      })
      if (!result.ok) {
        setRetentionError(result.error)
        toast.error(result.error)
        return
      }
      setRetentionSuccess(result.message ?? 'Configurações salvas.')
      toast.success(result.message ?? 'Configurações salvas.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-500/25">
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-white/85">
          Ajuste a economia de pontos, a mensagem rápida, os prazos de tarefas e
          a retenção de notificações da casa.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardAction>
            <span className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Coins className="size-5" />
            </span>
          </CardAction>
          <CardTitle>Economia de pontos</CardTitle>
          <CardDescription>
            Encarecimento automático do custo das recompensas a cada resgate
            aprovado.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-slate-700">
                Aumento automático de custo
              </span>
              <span className="text-xs text-slate-500">
                Aplicado sobre o custo atual da recompensa a cada aprovação de
                resgate.
              </span>
            </div>
            <Toggle
              checked={pricing.enabled}
              onChange={(enabled) =>
                setPricing((prev) => ({ ...prev, enabled }))
              }
              label="Aumento automático de custo"
            />
          </div>

          <div
            className={cn(
              'grid gap-4 sm:grid-cols-2',
              !pricing.enabled && 'pointer-events-none opacity-40'
            )}
          >
            <Field
              label="Recompensas de até"
              suffix="pontos não encarecem"
              value={pricing.noIncreaseMax}
              onChange={(noIncreaseMax) =>
                setPricing((prev) => ({ ...prev, noIncreaseMax }))
              }
              min={0}
            />
            <Field
              label="Faixa menor termina em"
              suffix="pontos"
              value={pricing.midMax}
              onChange={(midMax) => setPricing((prev) => ({ ...prev, midMax }))}
              min={0}
            />
            <Field
              label="Taxa da faixa menor"
              value={pricing.midRate * 100}
              onChange={(rate) =>
                setPricing((prev) => ({ ...prev, midRate: rate / 100 }))
              }
              min={0}
              max={100}
              step={0.5}
              suffix="%"
            />
            <Field
              label="Taxa da faixa maior"
              value={pricing.highRate * 100}
              onChange={(rate) =>
                setPricing((prev) => ({ ...prev, highRate: rate / 100 }))
              }
              min={0}
              max={100}
              step={0.5}
              suffix="%"
            />
            <Field
              label="Aumento mínimo"
              value={pricing.minBump}
              onChange={(minBump) =>
                setPricing((prev) => ({ ...prev, minBump }))
              }
              min={1}
              suffix="pontos"
              hint="Garante que uma recompensa na faixa encarecida nunca fique parada no mesmo preço."
            />
          </div>

          {pricingError ? (
            <p role="alert" className="text-sm text-red-600">
              {pricingError}
            </p>
          ) : null}
          {pricingSuccess ? (
            <p role="status" className="text-sm text-emerald-700">
              {pricingSuccess}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void savePricing()}
              disabled={pending}
            >
              <Save className="size-4" />
              Salvar economia de pontos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardAction>
            <span className="flex size-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <MessageSquare className="size-5" />
            </span>
          </CardAction>
          <CardTitle>Mensagem rápida</CardTitle>
          <CardDescription>
            Limites da mensagem rápida que o dependente envia aos tutores pelo
            sino.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Máximo de caracteres"
              value={quick.maxChars}
              onChange={(maxChars) =>
                setQuick((prev) => ({ ...prev, maxChars }))
              }
              min={1}
              max={2000}
            />
            <Field
              label="Tamanho máximo da imagem"
              value={quick.maxImageMb}
              onChange={(maxImageMb) =>
                setQuick((prev) => ({ ...prev, maxImageMb }))
              }
              min={1}
              max={50}
              suffix="MB"
            />
            <Field
              label="Mensagens acumuladas"
              value={quick.capacity}
              onChange={(capacity) =>
                setQuick((prev) => ({ ...prev, capacity }))
              }
              min={1}
              max={50}
              hint="Depois desse número de mensagens próprias não lidas, o envio fica bloqueado até que algum tutor abra (e a mais antiga seja apagada)."
            />
          </div>

          {quickError ? (
            <p role="alert" className="text-sm text-red-600">
              {quickError}
            </p>
          ) : null}
          {quickSuccess ? (
            <p role="status" className="text-sm text-emerald-700">
              {quickSuccess}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveQuick()}
              disabled={pending}
            >
              <Save className="size-4" />
              Salvar mensagem rápida
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardAction>
            <span className="flex size-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <CalendarClock className="size-5" />
            </span>
          </CardAction>
          <CardTitle>Prazos de tarefas</CardTitle>
          <CardDescription>
            Prazo padrão ao criar/restaurar tarefas e o percentual que acende o
            chip &quot;Prazo próximo&quot; (SLA).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Prazo padrão de criação/restauro"
              value={sla.defaultDueDays}
              onChange={(defaultDueDays) =>
                setSla((prev) => ({ ...prev, defaultDueDays }))
              }
              min={0}
              step={1}
              suffix="dias"
              hint="Dias a partir de agora preenchidos no campo de data ao criar uma tarefa e aplicados ao restaurar uma aprovada. 0 = sem prazo padrão."
            />
            <Field
              label="Percentual do 'Prazo próximo'"
              value={Math.round(sla.dueSoonRatio * 100)}
              onChange={(ratioPercent) => {
                const dueSoonRatio = Number.isNaN(ratioPercent)
                  ? 0
                  : ratioPercent / 100
                setSla((prev) => ({ ...prev, dueSoonRatio }))
              }}
              min={0}
              max={100}
              step={5}
              suffix="%"
              hint="Quando o tempo restante fica abaixo dessa fração do prazo total, o chip âmbar avisa. 0 desliga o aviso."
            />
          </div>

          {slaError ? (
            <p role="alert" className="text-sm text-red-600">
              {slaError}
            </p>
          ) : null}
          {slaSuccess ? (
            <p role="status" className="text-sm text-emerald-700">
              {slaSuccess}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveSla()}
              disabled={pending}
            >
              <Save className="size-4" />
              Salvar prazos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardAction>
            <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Clock3 className="size-5" />
            </span>
          </CardAction>
          <CardTitle>Adiamento de tarefas</CardTitle>
          <CardDescription>
            Dias oferecidos nos botões de aprovação de pedidos de adiamento (o
            dependente sempre pede; o ADMIN escolhe os dias).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">
              Opções de dias
              <span className="ml-1 text-xs font-normal text-slate-400">
                (de 1 a 5)
              </span>
            </span>
            {extensions.dayOptions.map((days, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={90}
                  step={1}
                  value={Number.isNaN(days) ? '' : days}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber
                    setExtensions((prev) => {
                      const next = [...prev.dayOptions]
                      next[index] = Number.isNaN(value) ? NaN : value
                      return { ...prev, dayOptions: next }
                    })
                  }}
                  className="min-h-10 w-24 text-sm"
                />
                <span className="text-sm text-slate-500">
                  {days === 1 ? 'dia' : 'dias'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-9 px-2 text-red-600"
                  aria-label={`Remover opção ${index + 1}`}
                  disabled={extensions.dayOptions.length <= 1}
                  onClick={() =>
                    setExtensions((prev) => ({
                      ...prev,
                      dayOptions: prev.dayOptions.filter(
                        (_, i) => i !== index
                      ),
                    }))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Cada opção vira um botão &quot;Aprovar (+N dias)&quot; no card da tarefa.
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                disabled={extensions.dayOptions.length >= 5}
                onClick={() =>
                  setExtensions((prev) => ({
                    ...prev,
                    dayOptions: [...prev.dayOptions, 1],
                  }))
                }
              >
                <Plus className="size-4" />
                Adicionar opção
              </Button>
            </div>
          </div>

          {extensionsError ? (
            <p role="alert" className="text-sm text-red-600">
              {extensionsError}
            </p>
          ) : null}
          {extensionsSuccess ? (
            <p role="status" className="text-sm text-emerald-700">
              {extensionsSuccess}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveExtensions()}
              disabled={pending}
            >
              <Save className="size-4" />
              Salvar adiamento
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardAction>
            <span className="flex size-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <BellRing className="size-5" />
            </span>
          </CardAction>
          <CardTitle>Notificações</CardTitle>
          <CardDescription>
            Quanto tempo uma notificação comum já lida fica no sino antes de ser
            apagada automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:max-w-xs">
            <Field
              label="Retenção de lidas"
              value={retention.readRetentionDays}
              onChange={(readRetentionDays) =>
                setRetention((prev) => ({ ...prev, readRetentionDays }))
              }
              min={1}
              max={365}
              step={1}
              suffix="dias"
              hint="As mensagens rápidas não seguem esse prazo — elas são apagadas pela regra própria de capacidade (2 lidas → apaga a mais antiga)."
            />
          </div>

          {retentionError ? (
            <p role="alert" className="text-sm text-red-600">
              {retentionError}
            </p>
          ) : null}
          {retentionSuccess ? (
            <p role="status" className="text-sm text-emerald-700">
              {retentionSuccess}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void saveRetention()}
              disabled={pending}
            >
              <Save className="size-4" />
              Salvar notificações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}