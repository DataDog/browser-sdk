import type { RumPlugin, RumPublicApi, ViewOptions } from '@datadog/browser-rum-core'

export interface SalesforceViewChange {
  pageReference?: unknown
  view?: ViewOptions
}

export interface SalesforceViewsPlugin {
  plugin: RumPlugin
  onPageReferenceChange: (viewChange: SalesforceViewChange) => void
}

export function createSalesforceViewsPlugin(): SalesforceViewsPlugin {
  let publicApi: Pick<RumPublicApi, 'startView'> | undefined
  let pendingViewChange: SalesforceViewChange | undefined
  let lastPageReferenceKey: string | undefined

  function onPageReferenceChange(viewChange: SalesforceViewChange) {
    const pageReferenceKey = getPageReferenceKey(viewChange.pageReference)
    if (pageReferenceKey && pageReferenceKey === lastPageReferenceKey) {
      return
    }

    if (pageReferenceKey) {
      lastPageReferenceKey = pageReferenceKey
    }

    if (!publicApi) {
      pendingViewChange = viewChange
      return
    }

    startView(viewChange)
  }

  function startView(viewChange: SalesforceViewChange) {
    if (viewChange.view) {
      publicApi?.startView(viewChange.view)
    }
  }

  return {
    plugin: {
      name: 'salesforce',
      onInit({ initConfiguration, publicApi: rumPublicApi }) {
        initConfiguration.trackViewsManually = true
        publicApi = rumPublicApi

        if (pendingViewChange) {
          startView(pendingViewChange)
          pendingViewChange = undefined
        }
      },
      getConfigurationTelemetry() {
        return { views: true }
      },
    },
    onPageReferenceChange,
  }
}

function getPageReferenceKey(pageReference: unknown) {
  if (pageReference === undefined) {
    return undefined
  }

  try {
    return JSON.stringify(pageReference)
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return String(pageReference)
  }
}
