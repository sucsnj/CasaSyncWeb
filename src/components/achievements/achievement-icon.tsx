import {
  Award,
  Coins,
  Crown,
  Flame,
  Heart,
  Medal,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  trophy: Trophy,
  star: Star,
  award: Award,
  flame: Flame,
  zap: Zap,
  coins: Coins,
  sparkles: Sparkles,
  target: Target,
  rocket: Rocket,
  heart: Heart,
  crown: Crown,
  medal: Medal,
}

/** Ícone Lucide da conquista (fallback troféu); aceita classes de tamanho. */
export function AchievementIcon({
  icon,
  className = 'size-5',
}: {
  icon: string | null
  className?: string
}) {
  const Icon = (icon && ICON_MAP[icon]) || Trophy
  return <Icon className={className} />
}

export { ICON_MAP }