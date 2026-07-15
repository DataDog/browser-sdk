import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'

export function makeSalesforceRumPublicApi(rumPublicApi: RumPublicApi): RumPublicApi {
  const init = rumPublicApi.init
  rumPublicApi.init = (initConfiguration: RumInitConfiguration) =>
    init({
      ...initConfiguration,
      sessionReplaySampleRate: 0,
    })
  return rumPublicApi
}
