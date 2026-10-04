'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormattedDateTime } from '@/components/ui/formatted-date'
import {
  punishmentDurationLabel,
  type ActivePunishment,
} from '@/utils/punishments'

/**
 * CASTIGO DO DEPENDENTE — ícone de triângulo no cabeçalho (ADR-0020).
 *
 * Fica **ao lado do sino** em todas as telas do dependente (`/dashboard/dependent`,
 * `/tasks`, `/rewards`, `/achievements`) e abre um modal com a descrição e a
 * duração informadas pelo ADMIN. É apenas leitura: o dependente não confirma,
 * não responde e nada muda no saldo — é um aviso do tutor.
 *
 * Sem Realtime (mesma decisão dos comunicados): o componente só existe quando o
 * servidor entregou um castigo ativo no render da tela.
 */
export function PunishmentIndicator({
  punishment,
}: {
  punishment: ActivePunishment
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Você está com um aviso do seu tutor. Toque para ver."
        aria-label="Ver aviso do tutor"
        className="relative rounded-full p-2 text-amber-300 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <TriangleAlert className="h-5 w-5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Aviso do seu tutor"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">
                Você está com um castigo ativo.
              </p>
              {punishment.description ? (
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-amber-800">
                  {punishment.description}
                </p>
              ) : (
                <p className="text-sm text-amber-700">
                  Sem descrição.
                </p>
              )}
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs font-medium text-slate-500">Duração</dt>
              <dd className="mt-0.5 font-medium text-slate-800">
                {punishmentDurationLabel(punishment.durationDays)}
              </dd>
            </div>
            {punishment.expiresAt ? (
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-medium text-slate-500">
                  Vence em
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