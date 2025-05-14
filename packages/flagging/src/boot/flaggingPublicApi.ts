import { makePublicApi, monitor, type PublicApi } from '@datadog/browser-core'

export interface FlaggingPublicApi extends PublicApi {
    getBooleanAssignment: (flagKey: string, defaultValue: boolean) => boolean
}

export function makeFlaggingPublicApi(): FlaggingPublicApi {
    return makePublicApi<FlaggingPublicApi>({
        getBooleanAssignment: monitor((flagKey: string, defaultValue: boolean) => defaultValue),
    })
}