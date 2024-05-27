const LOCALE = 'en-US'

export function formatNumber(n: number): string {
  if (isNaN(n)) {
    return '(NaN)'
  }
  return new Intl.NumberFormat(LOCALE, {}).format(n)
}

export function formatDuration(ns: number): string {
  if (isNaN(ns)) {
    return '(NaN)'
  }
  return new Intl.NumberFormat(LOCALE, { style: 'unit', unit: 'millisecond' }).format(ns / 1_000_000)
}

export function formatDate(ms: number): string {
  if (isNaN(ms)) {
    return '(NaN)'
  }
  const date = new Date(ms)
  const now = new Date()
  const isSameDay =
    now.getDate() === date.getDate() && now.getMonth() === date.getMonth() && now.getFullYear() === date.getFullYear()

  return new Intl.DateTimeFormat(LOCALE, {
    hour12: false, // slightly more compact date
    dateStyle: isSameDay ? undefined : 'medium',
    timeStyle: 'medium',
  })
    .formatToParts(date)
    .map(({ type, value }) => {
      if (type === 'second') {
        // Add milliseconds to the formatted date
        value += `.${new Intl.DateTimeFormat(LOCALE, {
          fractionalSecondDigits: 3,
        } as Intl.DateTimeFormatOptions).format(date)}`
      }
      return value
    })
    .join('')
}
