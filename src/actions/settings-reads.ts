'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import {
  getActiveAdminHouse,
  getSessionProfile,
} from '@/utils/house'
import {
  getHouseAttachmentBudgetSettings,
  getHouseAttachmentSettings,
  getHouseExtensionRulesSettings,
  getHouseNotificationMuteSettings,
  getHouseNotificationRetentionSettings,
  getHouseQuickMessageSettings,
  getHouseRewardPricingSettings,
  getHouseTaskDecaySettings,
  getHouseTaskRulesSettings,
  getHouseTaskSlaSettings,
  getHouseTimezoneSettings,
  getHouseTextLimitsSettings,
} from '@/utils/house-settings'
import { houseAttachmentBytes } from '@/utils/attachment-usage'
import { formatZonedOffset, houseTimezoneOptions } from '@/utils/timezone'
import type {
  AttachmentSettings,
  AttachmentBudgetSettings,
  ExtensionRulesSettings,
  HouseTimezoneSettings,
  NotificationMuteSettings,
  NotificationRetentionSettings,
  QuickMessageSettings,
  RewardPricingSettings,
  TaskDecaySettings,
  TaskRulesSettings,
  TaskSlaSettings,
  TextLimitsSettings,
} from '@/utils/settings'

export type SettingsBundle = {
  houseId: string
  rewardPricing: RewardPricingSettings
  quickMessage: QuickMessageSettings
  taskSla: TaskSlaSettings
  extensionRules: ExtensionRulesSettings
  notificationRetention: NotificationRetentionSettings
  notificationMute: NotificationMuteSettings
  taskDecay: TaskDecaySettings
  taskRules: TaskRulesSettings
  attachmentBudget: AttachmentBudgetSettings
  attachmentUsageBytes: number
  houseTimezone: HouseTimezoneSettings
  houseTimezoneOffset: string
  timezoneOptions: ReturnType<typeof houseTimezoneOptions>
  textLimits: TextLimitsSettings
  attachmentSettings: AttachmentSettings
}

/**
 * Bundle do `/dashboard/admin/settings`: todos os 13 getters + o peso dos
 * anexos, em paralelo, com escopo derivado da sessão (padrão ADR-0006).
 * Executado no servidor via Server Action — o cliente nunca passa `houseId`.
 */
export async function getSettingsBundle(): Promise<SettingsBundle> {
  const { user, profile } = await getSessionProfile()
  if (!user || !profile) throw new Error('UNAUTHENTICATED')
  if (profile.user_role !== 'ADMIN') throw new Error('FORBIDDEN')

  const activeHouse = await getActiveAdminHouse()
  if (!activeHouse) throw new Error('NO_HOUSE')

  const houseId = activeHouse.id

  const admin = createAdminClient()

  const [
    rewardPricing,
    quickMessage,
    taskSla,
    extensionRules,
    notificationRetention,
    notificationMute,
    taskDecay,
    taskRules,
    attachmentBudget,
    houseTimezone,
    textLimits,
    attachmentSettings,
    attachmentUsageBytes,
  ] = await Promise.all([
    getHouseRewardPricingSettings(houseId),
    getHouseQuickMessageSettings(houseId),
    getHouseTaskSlaSettings(houseId),
    getHouseExtensionRulesSettings(houseId),
    getHouseNotificationRetentionSettings(houseId),
    getHouseNotificationMuteSettings(houseId),
    getHouseTaskDecaySettings(houseId),
    getHouseTaskRulesSettings(houseId),
    getHouseAttachmentBudgetSettings(houseId),
    getHouseTimezoneSettings(houseId),
    getHouseTextLimitsSettings(houseId),
    getHouseAttachmentSettings(houseId),
    houseAttachmentBytes(admin, houseId).catch(() => 0),
  ])

  const now = new Date()
  const houseTimezoneOffset = formatZonedOffset(houseTimezone.timezone, now)
  const timezoneOptions = houseTimezoneOptions(now)

  return {
    houseId,
    rewardPricing,
    quickMessage,
    taskSla,
    extensionRules,
    notificationRetention,
    notificationMute,
    taskDecay,
    taskRules,
    attachmentBudget,
    attachmentUsageBytes,
    houseTimezone,
    houseTimezoneOffset,
    timezoneOptions,
    textLimits,
    attachmentSettings,
  }
}
