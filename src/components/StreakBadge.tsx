export interface StreakBadgeProps {
  streak: number
  size?: 'sm' | 'md' | 'lg'
}

export function StreakBadge({ streak, size = 'md' }: StreakBadgeProps) {
  const sizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  }

  if (streak <= 0) {
    return <span className={`text-muted ${sizes[size]}`}>—</span>
  }

  let color = 'text-accent'
  if (streak >= 30) color = 'text-gain'
  else if (streak >= 7) color = 'text-warn'

  return (
    <span className={`font-bold ${color} ${sizes[size]}`}>
      <span aria-hidden="true">🔥</span> {streak}
    </span>
  )
}