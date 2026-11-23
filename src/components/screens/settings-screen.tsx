'use client'

import { useAppSession } from '@/components/session/app-session'
import { useSettingsBundle } from '@/hooks/queries/use-settings'
import { SettingsAdmin } from '@/components/settings/settings-admin'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { QueryError } from '@/components/session/query-error'
import { NoHouseCard } from '@/components/session/no-house-card'

export function SettingsScreen() {
  const { houseId } = useAppSession()
  const { data, isPending, refetch } = useSettingsBundle(houseId)

  if (!houseId) return <NoHouseCard role="ADMIN" />
  if (isPending && !data) return <PageSkeleton cards={6} />
  if (!data) return <QueryError onRetry={() => void refetch()} />

  return (
    <SettingsAdmin
      rewardPricing={data.rewardPricing}
      quickMessage={data.quickMessage}
      taskSla={data.taskSla}
      extensionRules={data.extensionRules}
      notificationRetention={data.notificationRetention}
      notificationMute={data.notificationMute}
      taskDecay={data.taskDecay}
      taskRules={data.taskRules}
      attachmentBudgetProp={data.attachmentBudget}
      attachmentUsageBytes={data.attachmentUsageBytes}
      houseTimezone={data.houseTimezone}
      houseTimezoneOffset={data.houseTimezoneOffset}
      timezoneOptions={data.timezoneOptions}
      textLimits={data.textLimits}
      attachmentSettings={data.attachmentSettings}
      comunicadoConfirmation={data.comunicadoConfirmation}
    />
  )
}
