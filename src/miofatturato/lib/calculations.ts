// Configurable constants – values are also stored in DB table app_config
// and loaded at runtime via useAppConfig(). These serve as fallbacks.
export const FORFETTARIO_LIMIT = 85_000
export const FORFETTARIO_CLIFF = 100_000 // Immediate exit with IVA on same invoice
export const INPS_RATE = 0.2572
export const FREE_INVOICE_LIMIT = 3 // per month (free tier)

export function calcRedditoImponibile(fatturato: number, coefficiente: number): number {
  return fatturato * (coefficiente / 100)
}

export function calcImpostaSostitutiva(fatturato: number, coefficiente: number, aliquota: number): number {
  const reddito = calcRedditoImponibile(fatturato, coefficiente)
  return reddito * (aliquota / 100)
}

export function calcContributiINPS(fatturato: number, coefficiente: number, inpsRate = INPS_RATE): number {
  const reddito = calcRedditoImponibile(fatturato, coefficiente)
  return reddito * inpsRate
}

export function calcTotaleImposte(fatturato: number, coefficiente: number, aliquota: number, inpsRate = INPS_RATE): number {
  return calcImpostaSostitutiva(fatturato, coefficiente, aliquota) + calcContributiINPS(fatturato, coefficiente, inpsRate)
}

export function calcPercentualeLimite(fatturato: number, limit = FORFETTARIO_LIMIT): number {
  return (fatturato / limit) * 100
}

export function getLimitColor(percentuale: number): string {
  if (percentuale >= 85) return 'text-red-600'
  if (percentuale >= 70) return 'text-amber-600'
  return 'text-emerald-600'
}

export function getLimitBgColor(percentuale: number): string {
  if (percentuale >= 85) return 'bg-red-500'
  if (percentuale >= 70) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function getLimitTrackColor(percentuale: number): string {
  if (percentuale >= 85) return '[&>div]:bg-red-500'
  if (percentuale >= 70) return '[&>div]:bg-amber-500'
  return '[&>div]:bg-emerald-500'
}

export const CASSE_PREVIDENZIALI = [
  { id: 'separata' as const, label: 'Gestione Separata INPS', sublabel: 'Freelancer e professionisti senza albo / cassa', rate: 0.2607 },
  { id: 'artigiani' as const, label: 'Artigiani / Commercianti', sublabel: 'Iscritti alla gestione artigiani o commercianti', rate: 0.2572 },
  { id: 'custom' as const, label: 'Cassa professionale', sublabel: 'Inarcassa, ENPAM, CNPADC e altri', rate: null },
] as const

export type CassaId = 'separata' | 'artigiani' | 'custom'

export function getCassaId(inpsRate: number): CassaId {
  if (Math.abs(inpsRate - 0.2607) < 0.0001) return 'separata'
  if (Math.abs(inpsRate - 0.2572) < 0.0001) return 'artigiani'
  return 'custom'
}

export const ATECO_CODES = [
  { code: '62.01', label: 'Sviluppo software', coefficiente: 67 },
  { code: '62.02', label: 'Consulenza informatica', coefficiente: 67 },
  { code: '62.09', label: 'Altre attività IT', coefficiente: 67 },
  { code: '69.10', label: 'Attività legali', coefficiente: 78 },
  { code: '69.20', label: 'Contabilità e consulenza fiscale', coefficiente: 78 },
  { code: '70.22', label: 'Consulenza gestionale', coefficiente: 78 },
  { code: '71.12', label: 'Ingegneria e consulenza tecnica', coefficiente: 78 },
  { code: '73.11', label: 'Agenzie pubblicitarie', coefficiente: 78 },
  { code: '73.12', label: 'Pianificazione media', coefficiente: 78 },
  { code: '74.10', label: 'Design e comunicazione visiva', coefficiente: 78 },
  { code: '74.20', label: 'Attività fotografiche', coefficiente: 78 },
  { code: '74.30', label: 'Traduzione e interpretariato', coefficiente: 78 },
  { code: '74.90', label: 'Altre attività professionali', coefficiente: 78 },
  { code: '85.59', label: 'Formazione e insegnamento', coefficiente: 78 },
  { code: '86.90', label: 'Servizi sanitari', coefficiente: 78 },
  { code: '47.91', label: 'Commercio online', coefficiente: 40 },
  { code: '56.10', label: 'Ristorazione', coefficiente: 40 },
  { code: '68.20', label: 'Affitto immobili', coefficiente: 40 },
  { code: '96.02', label: 'Parrucchieri e estetica', coefficiente: 67 },
  { code: '96.09', label: 'Altri servizi alla persona', coefficiente: 67 },
] as const

export type AtecoCode = typeof ATECO_CODES[number]
