import type { RumInitConfiguration, RumPlugin, RumPublicApi } from '@datadog/browser-rum-core'

const salesforcePlugin = (): RumPlugin => ({
  name: 'salesforce',
  getConfigurationTelemetry() {
    return { salesforce: true }
  },
})

export function makeSalesforceRumPublicApi(rumPublicApi: RumPublicApi): RumPublicApi {
  const init = rumPublicApi.init
  rumPublicApi.init = (initConfiguration: RumInitConfiguration) =>
    init({
      ...initConfiguration,
      sessionReplaySampleRate: 0,
      plugins: [...(initConfiguration.plugins ?? []), salesforcePlugin()],
    })
  return rumPublicApi
}
