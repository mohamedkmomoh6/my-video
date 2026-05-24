import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/formatters'
import { FORFETTARIO_LIMIT, getLimitTrackColor } from '@/lib/calculations'
import { cn } from '@/lib/utils'
import type { MonthlySummary } from '@/types/database'

interface ProjectionCardProps {
  totaleAnno: number
  selectedYear: number
  monthlySummaries: MonthlySummary[]
}

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

interface PaceResult {
  mediaMensile: number
  windowSize: number // how many months contributed to the pace
  method: 'recent3' | 'ytd' | 'none'
  stdDev: number // standard deviation of the window samples
}

function computePace(
  monthlySummaries: MonthlySummary[],
  currentMonth: number,
  isCurrentYear: boolean
): PaceResult {
  // For a past year there is no "pace" — the year is closed.
  if (!isCurrentYear) {
    return { mediaMensile: 0, windowSize: 0, method: 'none', stdDev: 0 }
  }

  // Only consider fully elapsed months; the current month is incomplete and
  // would pull the average downward.
  const completedMonths = monthlySummaries
    .filter((m) => m.mese < currentMonth)
    .map((m) => Number(m.totale_mese))

  if (completedMonths.length === 0) {
    return { mediaMensile: 0, windowSize: 0, method: 'none', stdDev: 0 }
  }

  // Prefer the last 3 completed months (recent cadence); fall back to all
  // elapsed months if we don't have 3 yet.
  const useRecent = completedMonths.length >= 3
  const window = useRecent ? completedMonths.slice(-3) : completedMonths
  const sum = window.reduce((s, v) => s + v, 0)
  const mean = sum / window.length

  const variance =
    window.length > 1
      ? window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length
      : 0
  const stdDev = Math.sqrt(variance)

  return {
    mediaMensile: mean,
    windowSize: window.length,
    method: useRecent ? 'recent3' : 'ytd',
    stdDev,
  }
}

export function ProjectionCard({
  totaleAnno,
  selectedYear,
  monthlySummaries,
}: ProjectionCardProps) {
  const now = new Date()
  const thisYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1–12
  const isCurrentYear = selectedYear === thisYear

  const mesiRimanenti = isCurrentYear ? 12 - currentMonth : 0

  if (totaleAnno === 0) return null

  const pace = computePace(monthlySummaries, currentMonth, isCurrentYear)
  const { mediaMensile, stdDev, method, windowSize } = pace

  const proiezioneFineAnno = isCurrentYear
    ? totaleAnno + mediaMensile * mesiRimanenti
    : totaleAnno

  // Confidence band: ±1 stddev scaled by remaining months
  // (variance of sum of n independent months = n * variance of one month)
  const confidenceDelta = isCurrentYear
    ? stdDev * Math.sqrt(Math.max(0, mesiRimanenti))
    : 0
  const proiezioneLow = Math.max(totaleAnno, proiezioneFineAnno - confidenceDelta)
  const proiezioneHigh = proiezioneFineAnno + confidenceDelta

  const percentualeProiezione = Math.min((proiezioneFineAnno / FORFETTARIO_LIMIT) * 100, 110)
  const isOverLimit = proiezioneFineAnno > FORFETTARIO_LIMIT
  const highCrossesLimit = proiezioneHigh > FORFETTARIO_LIMIT && !isOverLimit

  let avvertimento: string | null = null
  let consiglio: string | null = null

  if (isCurrentYear && mesiRimanenti > 0 && mediaMensile > 0) {
    const importoMancante = FORFETTARIO_LIMIT - totaleAnno
    const mesiAlLimite = importoMancante / mediaMensile

    if (mesiAlLimite < mesiRimanenti) {
      const limitMonthIndex = Math.min(
        Math.floor(currentMonth + mesiAlLimite) - 1,
        11
      )
      const limitMonthName = MONTHS_IT[limitMonthIndex]
      avvertimento = `Al ritmo attuale supererai il limite forfettario intorno a ${limitMonthName}.`

      const massimalePerMese = Math.max(0, importoMancante / mesiRimanenti)
      const differenzaPerMese = mediaMensile - massimalePerMese
      consiglio = `Per restare sotto il limite: max ${formatCurrency(massimalePerMese)}/mese (${formatCurrency(differenzaPerMese)} in meno).`
    } else if (highCrossesLimit) {
      avvertimento = `Attenzione: con una cadenza sostenuta (fascia alta), la proiezione sfiora il limite forfettario.`
    } else if (percentualeProiezione >= 85) {
      avvertimento = `Proiezione a fine anno: ${percentualeProiezione.toFixed(0)}% del limite forfettario.`
    }
  }

  const paceLabel =
    method === 'recent3'
      ? `Basata sugli ultimi 3 mesi · media ${formatCurrency(mediaMensile)}/mese`
      : method === 'ytd'
        ? `Basata su ${windowSize} ${windowSize === 1 ? 'mese' : 'mesi'} di dati · media ${formatCurrency(mediaMensile)}/mese`
        : `Totale effettivo ${selectedYear}`

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isCurrentYear ? 'Proiezione annuale' : `Riepilogo ${selectedYear}`}
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCurrentYear && (
          <div className="grid grid-cols-3 divide-x rounded-lg border bg-slate-50/70 text-xs">
            <div className="flex flex-col gap-0.5 px-4 py-2.5">
              <span className="text-muted-foreground">Fatturato attuale</span>
              <span className="font-mono font-semibold text-sm">{formatCurrency(totaleAnno)}</span>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-2.5">
              <span className="text-muted-foreground">
                {method === 'recent3' ? 'Media 3 mesi' : 'Media mensile'}
              </span>
              <span className="font-mono font-semibold text-sm">{formatCurrency(mediaMensile)}</span>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-2.5">
              <span className="text-muted-foreground">Mesi rimanenti</span>
              <span className="font-mono font-semibold text-sm">{mesiRimanenti}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {isCurrentYear ? paceLabel : `Totale effettivo ${selectedYear}`}
            </span>
          </div>
          <Progress
            value={Math.min(percentualeProiezione, 100)}
            className={getLimitTrackColor(percentualeProiezione)}
          />
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono tracking-tight">
              {formatCurrency(proiezioneFineAnno)}
            </span>
            <span className={cn(
              'text-xs font-medium',
              isOverLimit ? 'text-red-600' : 'text-muted-foreground'
            )}>
              {Math.min(percentualeProiezione, 100).toFixed(0)}% del limite forfettario
            </span>
          </div>
          {isCurrentYear && confidenceDelta > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Fascia stimata:{' '}
              <span className="font-mono">{formatCurrency(proiezioneLow)}</span>
              {' – '}
              <span className="font-mono">{formatCurrency(proiezioneHigh)}</span>
              {' '}(±1σ sugli ultimi mesi)
            </p>
          )}
        </div>

        {avvertimento && (
          <div className={cn(
            'flex gap-2 rounded-lg p-3 text-xs',
            isOverLimit ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
          )}>
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="space-y-0.5">
              <p>{avvertimento}</p>
              {consiglio && <p className="opacity-80">{consiglio}</p>}
            </div>
          </div>
        )}

        {isCurrentYear && !avvertimento && mesiRimanenti > 0 && (
          <div className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Al ritmo attuale resti ampiamente sotto il limite forfettario.</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
