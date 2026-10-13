// Local-only playground: beforeSend displays events and drops them instead of sending to Datadog.
window.prototypeEvents = []
window.registerPrototypeSource = (stack, service) => {
  // Simulates the build plugin's injected metadata. The stack MUST come from the MFE module.
  if (stack) {
    window.DD_SOURCE_CODE_CONTEXT ||= {}
    window.DD_SOURCE_CODE_CONTEXT[stack] = { service, version: '1.0.0' }
  }
}
window.DD_RUM.init({
  applicationId: '00000000-0000-0000-0000-000000000000',
  clientToken: 'local-prototype',
  service: 'shell',
  version: 'shell-version',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 0,
  telemetrySampleRate: 0,
  trackUserInteractions: true,
  trackResources: false,
  trackLongTasks: false,
  defaultPrivacyLevel: 'allow',
  beforeSend(event, context) {
    if (event.type === 'action') {
      const entry = {
        name: event.action.target?.name,
        service: event.service,
        version: event.version,
        elementStack: context.elementStack,
        handlingStack: context.handlingStack,
      }
      window.prototypeEvents.push(entry)
      document.getElementById('events').textContent = JSON.stringify(window.prototypeEvents, null, 2)
    }
    return false
  },
})
