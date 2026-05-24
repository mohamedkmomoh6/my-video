import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { formatCurrency, formatPercent } from '../lib/formatters'
import { getLimitTrackColor, getLimitColor, FORFETTARIO_LIMIT } from '../lib/calculations'
import { cn } from '../lib/utils'

interface RevenueCardProps {
  totale: number
  percentuale: number
}

export function RevenueCard({ totale, percentuale }: RevenueCardProps) {
  const cappedPercent = Math.min(percentuale, 100)
  const remaining = FORFETTARIO_LIMIT - totale

  // Pacing: projected annual total at current pace
  const monthsElapsed = new Date().getMonth() + 1
  const projectedTotal = totale > 0 ? (totale / monthsElapsed) * 12 : 0
  const projectedPercent = (projectedTotal / FORFETTARIO_LIMIT) * 100

  const remainingBg =
    percentuale >= 85 ? 'bg-red-50' : percentuale >= 70 ? 'bg-amber-50' : 'bg-emerald-50'
  const remainingText =
    percentuale >= 85 ? 'text-red-700' : percentuale >= 70 ? 'text-amber-700' : 'text-emerald-700'

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-1 overflow-hidden border-t-2 border-t-primary bg-gradient-to-br from-white to-blue-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Fatturato {new Date().getFullYear()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <span className="text-4xl font-bold font-mono tracking-tight tabular-nums">
            {formatCurrency(totale)}
          </span>
        </div>
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-valuenow={Math.round(cappedPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Limite forfettario: ${formatPercent(percentuale)}`}
            className={cn(
              'relative h-3 w-full overflow-hidden rounded-full',
              getLimitTrackColor(percentuale)
            )}
          >
            <div
              className={cn(
                'h-full rounded-full',
                percentuale < 70
                  ? 'bg-emerald-500'
                  : percentuale < 85
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              )}
              style={{ width: `${Math.max(0, cappedPercent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className={cn('text-sm font-medium', getLimitColor(percentuale))}>
              {formatPercent(percentuale)} del limite
            </p>
            <span className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded',
              percentuale >= 85
                ? 'bg-red-100 text-red-700'
                : percentuale >= 70
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
            )}>
              {percentuale >= 85 ? 'Critico' : percentuale >= 70 ? 'Attenzione' : 'Nella norma'}
            </span>
          </div>

          {/* Remaining budget — prominent */}
          <div className={cn('flex items-center justify-between rounded-lg px-2.5 py-2', remainingBg)}>
            <span className={cn('text-xs font-medium', remainingText)}>Puoi ancora fatturare</span>
            <span className={cn('font-mono font-bold text-sm', remainingText)}>
              {remaining <= 0 ? 'Limite raggiunto' : formatCurrency(Math.max(0, remaining))}
            </span>
          </div>

          {/* Pacing indicator */}
          {totale > 0 && (
            <div className="flex items-center justify-between px-0.5 text-xs text-muted-foreground">
              <span>Al tuo ritmo attuale</span>
              <span className={cn('font-mono font-medium', getLimitColor(projectedPercent))}>
                ~{formatCurrency(projectedTotal)} a fine anno
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
