import { enricher } from '@datadog/core-next'

function deviceEnricher() {
  // Read once at creation time (won't change during session)
  const locale = navigator.language
  const locales = Array.from(navigator.languages || [locale])
  const timeZone = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone

  return enricher({
    name: 'device',
    transform: (data: Record<string, unknown>) => ({
      ...data,
      device: {
        locale,
        locales,
        time_zone: timeZone,
      },
    }),
  })
}

export { deviceEnricher }
