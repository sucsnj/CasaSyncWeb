import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  getHouseExtensionRulesSettings,
  getHouseNotificationMuteSettings,
  getHouseNotificationRetentionSettings,
  getHouseQuickMessageSettings,
  getHouseRewardPricingSettings,
  getHouseTaskDecaySettings,
  getHouseTaskRulesSettings,
  getHouseTaskSlaSettings,
  getHouseTimezoneSettings,
} from '@/utils/house-settings'
import { SettingsAdmin } from '@/components/settings/settings-admin'
import { formatZonedOffset, houseTimezoneOptions } from '@/utils/timezone'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Configurações',
}

export const dynamic = 'force-dynamic'

export default async function AdminSettingsPage() {
  const { profile } = await getSessionProfile()
  if (profile?.user_role !== 'ADMIN') {
    redirect('/dashboard/dependent')
  }

  const activeHouse = await getActiveAdminHouse()

  if (!activeHouse) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>Nenhuma casa ativa</CardTitle>
            <CardDescription>
              Selecione uma casa para configurá-la.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/admin/houses"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Gerenciar casas →
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const [
    rewardPricing,
    quickMessage,
    taskSla,
    extensionRules,
    notificationRetention,
    notificationMute,
    taskDecay,
    taskRules,
    houseTimezone,
  ] = await Promise.all([
    getHouseRewardPricingSettings(activeHouse.id),
    getHouseQuickMessageSettings(activeHouse.id),
    getHouseTaskSlaSettings(activeHouse.id),
    getHouseExtensionRulesSettings(activeHouse.id),
    getHouseNotificationRetentionSettings(activeHouse.id),
    getHouseNotificationMuteSettings(activeHouse.id),
    getHouseTaskDecaySettings(activeHouse.id),
    getHouseTaskRulesSettings(activeHouse.id),
    getHouseTimezoneSettings(activeHouse.id),
  ])

  // Offset do fuso da casa, calculado NO SERVIDOR e repassado como texto: o
  // `<select>` só mostra o nome da cidade, então o offset é o que torna a escolha
  // visível de imediato. Texto estável (a página é `force-dynamic`) => sem risco
  // de hydration mismatch. A lista inteira recebe o mesmo tratamento, porque o
  // offset do CLIENTE viria de `Intl` no render — o que pode divergir do servidor.
  const now = new Date()
  const houseTimezoneOffset = formatZonedOffset(houseTimezone.timezone, now)
  const timezoneOptions = houseTimezoneOptions(now)

  return (
    <div className="flex flex-col gap-6">
      <SettingsAdmin
        rewardPricing={rewardPricing}
        quickMessage={quickMessage}
        taskSla={taskSla}
        extensionRules={extensionRules}
        notificationRetention={notificationRetention}
        notificationMute={notificationMute}
        taskDecay={taskDecay}
        taskRules={taskRules}
        houseTimezone={houseTimezone}
        houseTimezoneOffset={houseTimezoneOffset}
        timezoneOptions={timezoneOptions}
      />
    </div>
  )
}