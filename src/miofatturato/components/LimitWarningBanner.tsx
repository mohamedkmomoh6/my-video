import { useState } from 'react'

import { FORFETTARIO_CLIFF, FORFETTARIO_LIMIT } from '../lib/calculations'
import { formatCurrency } from '../lib/formatters'
import { cn } from '../lib/utils'

interface LimitWarningBannerProps {
  percentualeLimite: number
  totaleAnno: number
}

type Severity = 'cliff' | 'critical' | 'warning' | null

const IconBase = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
)

const AlertTriangle = ({ className }: { className?: string }) => (
  <IconBase className={className}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </IconBase>
)

const OctagonAlert = ({ className }: { className?: string }) => (
  <IconBase className={className}>
    <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2Z" />
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
  </IconBase>
)

const ShieldAlert = ({ className }: { className?: string }) => (
  <IconBase className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </IconBase>
)

const X = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </svg>
)

function resolveSeverity(totaleAnno: number, percentualeLimite: number): Severity {
  if (totaleAnno >= FORFETTARIO_CLIFF) return 'cliff'
  if (percentualeLimite >= 85) return 'critical'
  if (percentualeLimite >= 70) return 'warning'
  return null
}

export function LimitWarningBanner({ percentualeLimite, totaleAnno }: LimitWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  const severity = resolveSeverity(totaleAnno, percentualeLimite)
  if (!severity) return null

  // Cliff is never dismissible — too important
  if (dismissed && severity !== 'cliff') return null

  const rimanente = Math.max(0, FORFETTARIO_LIMIT - totaleAnno)
  const sforamentoCliff = Math.max(0, totaleAnno - FORFETTARIO_CLIFF)

  const styles =
    severity === 'cliff'
      ? {
          container: 'border-red-300 bg-red-100',
          icon: 'text-red-700',
          title: 'text-red-900',
          body: 'text-red-800',
          hover: 'hover:bg-red-200',
          close: 'text-red-600',
        }
      : severity === 'critical'
        ? {
            container: 'border-red-200 bg-red-50',
            icon: 'text-red-600',
            title: 'text-red-800',
            body: 'text-red-700',
            hover: 'hover:bg-red-100',
            close: 'text-red-500',
          }
        : {
            container: 'border-amber-200 bg-amber-50',
            icon: 'text-amber-600',
            title: 'text-amber-800',
            body: 'text-amber-700',
            hover: 'hover:bg-amber-100',
            close: 'text-amber-500',
          }

  const Icon =
    severity === 'cliff' ? ShieldAlert : severity === 'critical' ? OctagonAlert : AlertTriangle

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-xl border p-4', styles.container)}
    >
      <div className={cn('mt-0.5 flex-shrink-0', styles.icon)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-semibold', styles.title)}>
          {severity === 'cliff'
            ? `Soglia €100.000 superata: uscita immediata dal forfettario`
            : severity === 'critical'
              ? `Limite critico: ${Math.round(percentualeLimite)}% del tetto forfettario raggiunto`
              : `Attenzione: ${Math.round(percentualeLimite)}% del tetto forfettario raggiunto`}
        </p>
        <p className={cn('mt-0.5 text-xs', styles.body)}>
          {severity === 'cliff' ? (
            <>
              Hai superato i {formatCurrency(FORFETTARIO_CLIFF)} di
              {sforamentoCliff > 0 ? ` ${formatCurrency(sforamentoCliff)}` : ''}.
              Sei uscito dal regime forfettario <strong>con effetto immediato</strong>: questa
              stessa fattura e tutte le successive devono essere emesse con IVA e ritenuta
              d&apos;acconto. Contatta subito il tuo commercialista.
            </>
          ) : rimanente > 0 ? (
            `Puoi ancora fatturare ${formatCurrency(rimanente)} prima di superare i ${formatCurrency(FORFETTARIO_LIMIT)}.`
          ) : (
            `Hai superato il limite forfettario di ${formatCurrency(FORFETTARIO_LIMIT)}. Consulta il tuo commercialista.`
          )}
        </p>
      </div>

      {severity !== 'cliff' && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Chiudi avviso"
          className={cn('flex-shrink-0 rounded-md p-1', styles.hover)}
        >
          <X className={cn('h-4 w-4', styles.close)} />
        </button>
      )}
    </div>
  )
}
