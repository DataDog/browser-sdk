import { makePublicApi, monitor, type PublicApi } from '@datadog/browser-core'

export interface FlaggingPublicApi extends PublicApi {
  getBooleanAssignment: (flagKey: string, defaultValue: boolean) => boolean
}
export interface Strategy {
  getBooleanAssignment: (flagKey: string, defaultValue: boolean) => boolean
}

export function makeFlaggingPublicApi(): FlaggingPublicApi {
  let strategy = {
    getBooleanAssignment: () => false,
  }

  return makePublicApi<FlaggingPublicApi>({
    getBooleanAssignment: monitor(strategy.getBooleanAssignment),
  })
}
