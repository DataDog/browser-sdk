import { addTelemetryError, buildUrl } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi, ViewOptions } from '@datadog/browser-rum-core'

export type SalesforceGenerateUrl = (pageReference: unknown) => Promise<string>

export type SalesforceRumInitConfiguration = Omit<
  RumInitConfiguration,
  'profilingSampleRate' | 'sessionReplaySampleRate' | 'trackViewsManually'
>

export interface SalesforceViewOptions {
  pageReference: unknown
  generateUrl: SalesforceGenerateUrl
  baseUrl: string
}

export interface SalesforceRumPublicApi extends RumPublicApi {
  initSalesforce: (configuration: SalesforceRumInitConfiguration) => void
  startSalesforceView: (options: SalesforceViewOptions) => Promise<void>
}

export function makeSalesforceRumPublicApi(
  rumPublicApi: RumPublicApi
): Pick<SalesforceRumPublicApi, 'initSalesforce' | 'startSalesforceView'> {
  let initializationConfiguration: RumInitConfiguration | undefined
  let initialized = false
  let lastStartedUrl: string | undefined

  function initSalesforce(configuration: SalesforceRumInitConfiguration) {
    if (initializationConfiguration) {
      return
    }

    initializationConfiguration = {
      ...configuration,
      profilingSampleRate: 0,
      sessionReplaySampleRate: 0,
      trackViewsManually: true,
    }
    startRum()
  }

  async function startSalesforceView({ pageReference, generateUrl, baseUrl }: SalesforceViewOptions) {
    try {
      const url = await generateUrl(pageReference)
      const absoluteUrl = buildUrl(url, baseUrl).href
      startView(url, absoluteUrl)
      startRum()
    } catch (error) {
      addTelemetryError(error)
    }
  }

  function startView(name: string, url: ViewOptions['url']) {
    if (name === lastStartedUrl) {
      return
    }
    lastStartedUrl = name
    rumPublicApi.startView({ name, url })
  }

  function startRum() {
    if (initialized || !initializationConfiguration || lastStartedUrl === undefined) {
      return
    }
    initialized = true
    rumPublicApi.init(initializationConfiguration)
  }

  return { initSalesforce, startSalesforceView }
}
