import { AlertTriangle, OctagonAlert, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/formatters'
import { cn } from '@/lib/utils'
import type { ClientConcentration } from '@/hooks/useDashboardData'

interface ClientConcentrationAlertProps {
  data: ClientConcentration | null
}

export function ClientConcentrationAlert({ data }: ClientConcentrationAlertProps) {
  if (!data || data.severity === 'none') return null

  const isCritical = data.severity === 'critical'
  const sharePct = Math.round(data.topClientShare * 100)

  return (
    <Card
      role="alert"
      className={cn(
        'border-2',
        isCritical ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            )}
          >
            {isCritical ? (
              <OctagonAlert className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <CardTitle
            className={cn(
              'text-sm font-semibold',
              isCritical ? 'text-red-800' : 'text-amber-800'
            )}
          >
            {isCritical
              ? 'Concentrazione clienti critica'
              : 'Attenzione: concentrazione clienti elevata'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            'rounded-lg border bg-white/70 px-3 py-2.5 text-xs',
            isCritical ? 'border-red-200' : 'border-amber-200'
          )}
        >
          <div className="flex items-center gap-2">
            <Users
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                isCritical ? 'text-red-600' : 'text-amber-600'
              )}
            />
            <span className="truncate font-medium text-slate-800">{data.topClientName}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span
              className={cn(
                'font-mono text-lg font-bold tabular-nums',
                isCritical ? 'text-red-700' : 'text-amber-700'
              )}
            >
              {sharePct}%
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatCurrency(data.topClientTotal)} / {formatCurrency(data.totalRevenue)}
            </span>
          </div>
        </div>

        <p
          className={cn(
            'text-xs leading-relaxed',
            isCritical ? 'text-red-800' : 'text-amber-800'
          )}
        >
          {isCritical ? (
            <>
              Un singolo cliente rappresenta <strong>oltre l&apos;80%</strong> del tuo fatturato.
              Se questo cliente è il tuo ex datore di lavoro (ultimi 2 anni) o una società
              collegata, <strong>decadono i requisiti per il regime forfettario</strong>, anche
              sotto la soglia di €85.000.
            </>
          ) : (
            <>
              Un singolo cliente supera il <strong>50%</strong> del tuo fatturato. Se nei 2
              anni precedenti era il tuo datore di lavoro (o è collegato ad esso),{' '}
              <strong>rischi di uscire dal forfettario</strong> indipendentemente dal limite
              di €85.000.
            </>
          )}
        </p>

        <p className="text-[11px] text-muted-foreground">
          Riferimento: Art. 1 c. 57 lett. d-bis L. 190/2014. In caso di dubbio consulta il tuo
          commercialista.
        </p>
      </CardContent>
    </Card>
  )
}
