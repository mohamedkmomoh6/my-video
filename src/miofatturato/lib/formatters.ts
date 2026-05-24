const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Formats a number as Italian currency (e.g. 7.295,00 €).
 * Uses a manual formatter to guarantee the dot-as-thousands-separator
 * regardless of browser ICU data completeness.
 */
export function formatCurrency(amount: number): string {
  const isNegative = amount < 0
  const abs = Math.abs(amount)
  const [intPart, decPart] = abs.toFixed(2).split('.')
  const intWithSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${isNegative ? '-' : ''}${intWithSep},${decPart} €`
}

export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate))
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1).replace('.', ',')}%`
}
