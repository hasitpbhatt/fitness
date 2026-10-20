import { Button, Card } from '../ui'
import type { MacroTargets, MacroTotals } from '../../lib/types'

type Props = {
  totals: MacroTotals
  targets: MacroTargets | null
  onEditTargets: () => void
}

const ROWS: {
  key: keyof MacroTotals
  targetKey: keyof MacroTargets
  label: string
  unit: string
  bar: string
}[] = [
  { key: 'calories', targetKey: 'calorie_target', label: 'Calories', unit: 'kcal', bar: 'bg-accent' },
  { key: 'protein_g', targetKey: 'protein_target_g', label: 'Protein', unit: 'g', bar: 'bg-gain' },
  { key: 'carbs_g', targetKey: 'carbs_target_g', label: 'Carbs', unit: 'g', bar: 'bg-warn' },
  { key: 'fat_g', targetKey: 'fat_target_g', label: 'Fat', unit: 'g', bar: 'bg-loss' },
]

function formatValue(value: number, unit: string) {
  return `${Math.round(value).toLocaleString('en-US')}${unit === 'kcal' ? ` ${unit}` : unit}`
}

export function MacroBars({ totals, targets, onEditTargets }: Props) {
  const hasTargets = targets !== null && ROWS.some((row) => (targets[row.targetKey] ?? 0) > 0)

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h2 className="font-semibold text-content">Nutrition today</h2>
          <p className="text-[12px] text-muted">
            {hasTargets ? 'Progress against your daily targets.' : 'Set targets to track your macros.'}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onEditTargets}>
          {hasTargets ? 'Edit targets' : 'Set targets'}
        </Button>
      </div>

      <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
        {ROWS.map((row) => {
          const value = totals[row.key]
          const target = targets?.[row.targetKey] ?? null
          const percent = target && target > 0 ? Math.round((value / target) * 100) : null
          return (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] font-medium text-content">{row.label}</span>
                <span className="num text-[12px] text-muted">
                  {formatValue(value, row.unit)}
                  {target != null && <span className="text-muted/70"> / {formatValue(target, row.unit)}</span>}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                {target != null && target > 0 ? (
                  <div
                    className={`h-full rounded-full transition-[width] ${row.bar}`}
                    style={{ width: `${Math.min(100, percent ?? 0)}%` }}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, percent ?? 0)}
                    aria-label={`${row.label} ${percent}% of target`}
                  />
                ) : (
                  <div className="h-full w-full rounded-full border border-dashed border-line" />
                )}
              </div>
              {percent != null && (
                <p className={`mt-1 text-[11px] ${percent > 100 ? 'text-loss' : 'text-muted'}`}>
                  {percent}% of target
                </p>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
