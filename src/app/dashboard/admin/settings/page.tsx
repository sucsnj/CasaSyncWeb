import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getActiveAdminHouse, getSessionProfile } from '@/utils/house'
import {
  getHouseExtensionRulesSettings,
  getHouseNotificationRetentionSettings,
  getHouseQuickMessageSettings,
  getHouseRewardPricingSettings,
  getHouseTaskSlaSettings,
} from '@/utils/house-settings'
import { SettingsAdmin } from '@/components/settings/settings-admin'
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
      <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
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

  const [rewardPricing, quickMessage, taskSla, extensionRules, notificationRetention] =
  await Promise.all([
    getHouseRewardPricingSettings(activeHouse.id),
    getHouseQuickMessageSettings(activeHouse.id),
    getHouseTaskSlaSettings(activeHouse.id),
    getHouseExtensionRulesSettings(activeHouse.id),
    getHouseNotificationRetentionSettings(activeHouse.id),
  ])

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-4 pt-20 pb-24 md:p-6 md:pt-24 md:pb-6">
      <SettingsAdmin
        rewardPricing={rewardPricing}
        quickMessage={quickMessage}
        taskSla={taskSla}
        extensionRules={extensionRules}
        notificationRetention={notificationRetention}
      />
    </div>
  )
}