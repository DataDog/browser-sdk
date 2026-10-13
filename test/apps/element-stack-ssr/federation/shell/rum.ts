import type {} from '../../browser'

// The shared SSR examples call this helper to simulate metadata in standalone mode.
// Here it is disabled: every remote is instrumented by the REAL Datadog webpack plugin.
window.registerPrototypeSource = () => undefined
window.prototypeEvents = []

// One SDK instance, initialized once by the shell. No remote initializes RUM.
const rum = window.DD_RUM as typeof window.DD_RUM & { init(configuration: unknown): void }
rum.init({
  applicationId: '00000000-0000-0000-0000-000000000000',
  clientToken: 'local-prototype',
  service: 'mfe-shell',
  version: '0.1.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 0,
  telemetrySampleRate: 0,
  trackUserInteractions: true,
  trackResources: false,
  trackLongTasks: false,
  defaultPrivacyLevel: 'allow',
  beforeSend(event: any, context: any) {
    if (event.type === 'action') {
      const entry = {
        name: event.action.target?.name,
        service: event.service,
        version: event.version,
        elementStack: context.elementStack,
        handlingStack: context.handlingStack,
      }
      window.prototypeEvents.push(entry)
      document.getElementById('events')!.textContent = JSON.stringify(window.prototypeEvents, null, 2)
      const row = document.createElement('tr')
      for (const value of [
        entry.name,
        entry.service,
        entry.version,
        entry.elementStack?.startsWith('HandlingStack')
          ? 'API'
          : entry.elementStack
            ? entry.name === 'Attribute click'
              ? 'Attribute'
              : 'Property'
            : 'Shell',
      ]) {
        const cell = document.createElement('td')
        cell.textContent = value || '—'
        row.appendChild(cell)
      }
      document.getElementById('event-rows')!.prepend(row)
    }
    return false
  },
})
