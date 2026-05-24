import { useState, useEffect } from 'react'
import { TrendingUp, AlertTriangle, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import {
  FORFETTARIO_LIMIT,
  INPS_RATE,
  getLimitColor,
  getLimitTrackColor,
  calcImpostaSostitutiva,
  calcContributiINPS,
} from '@/lib/calculations'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface ScenarioCardProps {
  initialAmount?: number
}

const MONTHS_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]

export function ScenarioCard({ initialAmount }: ScenarioCardProps) {
  const { user, profile } = useAuth()
  const [totaleAnno, setTotaleAnno] = useState<number | null>(null)
  const [mediaMensile, setMediaMensile] = useState<number>(0)
  const [rawInput, setRawInput] = useState(String(initialAmount ?? 1000))

  const coefficiente = Number(profile?.coefficiente_redditivita ?? 67)
  const aliquota = Number(profile?.aliquota_imposta ?? 15)
  const inpsRate = Number(profile?.inps_rate ?? INPS_RATE)

  useEffect(() => {
    if (!user) return
    const year = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    Promise.all([
      supabase
        .from('yearly_summaries')
        .select('totale_anno')
        .eq('user_id', user.id)
        .eq('anno', year)
        .maybeSingle(),
      supabase
        .from('monthly_summaries')
        .select('totale_mese')
        .eq('user_id', user.id)
        .eq('anno', year),
    ]).then(([yearlyRes, monthlyRes]) => {
      const totale = Number(yearlyRes.data?.totale_anno ?? 0)
      setTotaleAnno(totale)

      const totaliMensili = (monthlyRes.data ?? []).map((m) => Number(m.totale_mese))
      const somma = totaliMensili.reduce((s, v) => s + v, 0)
      // Only count elapsed months so a new year in January doesn't divide by 12
      const divisore = Math.max(1, currentMonth)
      setMediaMensile(somma > 0 ? somma / divisore : 0)
    })
  }, [user])

  useEffect(() => {
    if (initialAmount !== undefined) {
      setRawInput(String(initialAmount))
    }
  }, [initialAmount])

  const simulatedAmount = Math.max(0, Number(rawInput) || 0)
  const currentTotal = totaleAnno ?? 0
  const newTotal = currentTotal + simulatedAmount
  const newPercent = (newTotal / FORFETTARIO_LIMIT) * 100
  const remaining = FORFETTARIO_LIMIT - newTotal
  const daAccantonare =
    calcImpostaSostitutiva(simulatedAmount, coefficiente, aliquota) +
    calcContributiINPS(simulatedAmount, coefficiente, inpsRate)
  const isOverLimit = newTotal > FORFETTARIO_LIMIT

  // Time-to-limit projection at current pace, starting from newTotal (post-scenario)
  const now = new Date()
  const currentMonthIdx = now.getMonth() // 0–11
  const mesiRimanenti = 11 - currentMonthIdx // whole months left in year after current
  let timeToLimitMessage: string | null = null
  let timeToLimitCritical = false

  if (mediaMensile > 0 && !isOverLimit) {
    const margine = FORFETTARIO_LIMIT - newTotal
    const mesiAlLimite = margine / mediaMensile

    if (mesiAlLimite < mesiRimanenti) {
      const limitMonthIdx = Math.min(currentMonthIdx + Math.ceil(mesiAlLimite), 11)
      const mesiArrotondati = Math.max(1, Math.round(mesiAlLimite))
      timeToLimitMessage =
        `Al ritmo attuale (${formatCurrency(mediaMensile)}/mese) raggiungi il limite ` +
        `in ~${mesiArrotondati} ${mesiArrotondati === 1 ? 'mese' : 'mesi'} ` +
        `(intorno a ${MONTHS_IT[limitMonthIdx]}).`
      timeToLimitCritical = true
    } else {
      timeToLimitMessage =
        `Al ritmo attuale (${formatCurrency(mediaMensile)}/mese) resti sotto il limite ` +
        `fino a fine anno.`
    }
  }

  if (totaleAnno === null) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Simulatore impatto fattura
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">
            Importo fattura ipotetica (€)
          </label>
          <Input
            type="number"
            min="0"
            step="100"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            className="font-mono"
            placeholder="1.000"
          />
        </div>

        <div className="space-y-1.5 rounded-lg border bg-slate-50/70 px-4 py-3 text-xs">
          <div className="flex justify-between text-muted-foreground">
            <span>Fatturato attuale</span>
            <span className="font-mono font-medium">{formatCurrency(currentTotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>+ Nuova fattura</span>
            <span className="font-mono font-medium">{formatCurrency(simulatedAmount)}</span>
          </div>
          <div className="border-t pt-1.5" />
          <div className={cn('flex justify-between font-semibold', getLimitColor(newPercent))}>
            <span>= Nuovo totale</span>
            <span className="font-mono">{formatCurrency(newTotal)}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Progress
            value={Math.min(newPercent, 100)}
            className={getLimitTrackColor(newPercent)}
          />
          <p className={cn('text-xs font-medium', getLimitColor(newPercent))}>
            {formatPercent(newPercent)} del limite forfettario
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {simulatedAmount > 0 && (
            <span className="rounded bg-amber-50 px-2.5 py-1 font-mono font-semibold text-amber-700">
              Accantonare {formatCurrency(daAccantonare)}
            </span>
          )}
          <span className={cn(
            'rounded px-2.5 py-1 font-mono font-semibold',
            isOverLimit
              ? 'bg-red-50 text-red-700'
              : 'bg-emerald-50 text-emerald-700'
          )}>
            {isOverLimit
              ? `Sforato di ${formatCurrency(Math.abs(remaining))}`
              : `Margine ${formatCurrency(remaining)}`}
          </span>
        </div>

        {timeToLimitMessage && (
          <div
            className={cn(
              'flex gap-2 rounded-lg px-3 py-2 text-xs',
              timeToLimitCritical
                ? 'bg-amber-50 text-amber-800'
                : 'bg-slate-50 text-slate-700'
            )}
          >
            <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{timeToLimitMessage}</span>
          </div>
        )}

        {isOverLimit && (
          <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Con questa fattura supereresti il limite forfettario di {formatCurrency(Math.abs(remaining))}.
              Considera di posticipare l&apos;emissione all&apos;anno prossimo.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
