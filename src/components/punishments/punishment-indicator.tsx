'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormattedDateTime } from '@/components/ui/formatted-date'
import {
  PUNISHMENT_LEVEL_WARNING,
  punishmentDurationLabel,
  type ActivePunishment,
} from '@/utils/punishments'
import { cn } from '@/lib/utils'

/**
 * AVISO / CASTIGO DO DEPENDENTE — ícone de triângulo no cabeçalho (ADR-0020).
 *
 * Fica **ao lado do sino** em todas as telas do dependente (`/dashboard/dependent`,
 * `/tasks`, `/rewards`, `/achievements`) e abre um modal com a descrição e a
 * duração informadas pelo ADMIN. É apenas leitura: o dependente não confirma,
 * não responde e nada muda no saldo — é um aviso do tutor.
 *
 * **A cor é o nível** (escolhido pelo ADMIN ao aplicar):
 * - **amarelo** = aviso de que o castigo está próximo (nível 1);
 * - **vermelho** = castigo vigente (nível 2).
 *
 * Os dois continuam sendo só indicador — nenhuma regra de ponto, tarefa ou
 * recompensa muda (ADR-0020).
 *
 * Sem Realtime e **sem notificação** (mesma decisão dos comunicados): o
 * componente só existe quando o servidor entregou um aviso/castigo ativo no
 * render da tela.
 */
export function PunishmentIndicator({
  punishment,
}: {
  punishment: ActivePunishment
}) {
  const [open, setOpen] = useState(false)

  const isWarning = punishment.level === PUNISHMENT_LEVEL_WARNING

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          isWarning
            ? 'Você recebeu um aviso do tutor. Toque para ver.'
            : 'Você está com um castigo ativo. Toque para ver.'
        }
        aria-label={
          isWarning ? 'Ver aviso do tutor' : 'Ver castigo do tutor'
        }
        className={cn(
          'relative rounded-full p-2 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          isWarning ? 'text-amber-300' : 'text-red-400'
        )}
      >
        <TriangleAlert className="h-5 w-5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isWarning ? 'Aviso do tutor' : 'Castigo ativo'}
      >
        <div className="flex flex-col gap-4">
          <div
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4',
              isWarning
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-900'
            )}
          >
            <TriangleAlert
              className={cn(
                'mt-0.5 h-6 w-6 shrink-0',
                isWarning ? 'text-amber-600' : 'text-red-600'
              )}
            />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                {isWarning
                  ? 'Você recebeu um aviso do tutor.'
                  : 'Você está com um castigo ativo.'}
              </p>
              {isWarning ? (
                <p className="text-sm text-amber-700">
                  Ainda não há castigo — é um aviso de que o castigo está
                  próximo. Nada foi descontado.
                </p>
              ) : null}
              {punishment.description ? (
                <p
                  className={cn(
                    'text-sm leading-relaxed whitespace-pre-wrap',
                    isWarning ? 'text-amber-800' : 'text-red-800'
                  )}
                >
                  {punishment.description}
                </p>
              ) : (
                <p className={cn('text-sm', isWarning ? 'text-amber-700' : 'text-red-700')}>
                  Sem descrição.
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-500">
                {isWarning ? 'Validade do aviso' : 'Duração'}
              </dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {punishmentDurationLabel(punishment.durationDays)}
              </dd>
            </div>
            {punishment.expiresAt ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">
                  {isWarning ? 'Aviso expira em' : 'Vence em'}
                </dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  <FormattedDateTime iso={punishment.expiresAt} />
                </dd>
              </div>
            ) : null}
          </dl>

          <Button onClick={() => setOpen(false)}>Entendi</Button>
        </div>
      </Modal>
    </>
  )
}