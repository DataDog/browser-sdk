import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

const DATADOG_PARAMS = [
  'c__applicationId',
  'c__clientToken',
  'c__datadogInitConfiguration',
  'c__datadogResourceName',
  'c__env',
  'c__service',
  'c__site',
]

const defaultDatadogRumConfig = {
  trackViewsManually: true,
  trackEarlyRequests: true,
  trackLongTasks: true,
  trackResources: true,
  trackUserInteractions: true,
  beforeSend: (event) => {
    if (event.view) {
      const cleanUrl = new URL(event.view.url, window.location.origin)
      DATADOG_PARAMS.forEach((param) => cleanUrl.searchParams.delete(param))
      event.view.url = cleanUrl.href
      event.view.name = cleanUrl.pathname + cleanUrl.search + cleanUrl.hash
    }
    if (event.resource?.url) {
      const cleanUrl = new URL(event.resource.url, window.location.origin)
      DATADOG_PARAMS.forEach((param) => cleanUrl.searchParams.delete(param))
      event.resource.url = cleanUrl.href
    }
  },
}

export default class DatadogInit extends NavigationMixin(LightningElement) {
  connectedCallback() {
    this.initialize()
  }

  @wire(CurrentPageReference)
  handleCurrentPageReference(pageReference) {
    if (!pageReference) {
      return
    }

    this.initialize()

    if (window.DD_RUM) {
      this.startViewForPageReference(pageReference)
    }
  }

  startViewForPageReference(pageReference) {
    const urlPromise = this[NavigationMixin.GenerateUrl](pageReference)
    urlPromise.then((url) => {
      if (url === lastStartedUrl) {
        return
      }
      lastStartedUrl = url
      const absoluteUrl = new URL(url, window.location.origin).href
      window.DD_RUM.startView({ name: url, url: absoluteUrl })
    })
  }

  initialize() {
    if (!datadogInitialization) {
      datadogInitialization = this.loadDatadogRum()
    }
  }

  loadDatadogRum() {
    const searchParams = new URLSearchParams(window.location.search)
    const resourceName = searchParams.get('c__datadogResourceName')
    const resourceUrl = resourceName ? `/resource/${encodeURIComponent(resourceName)}` : datadogRumSlim

    return loadScript(this, resourceUrl).then(() => {
      const initConfig = this.getInitConfiguration(searchParams)
      if (!initConfig.applicationId || !initConfig.clientToken) {
        window.console.warn('Datadog RUM not initialized: missing applicationId or clientToken')
        return
      }

      window.DD_RUM.init(initConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }

  getInitConfiguration(searchParams) {
    return {
      applicationId: searchParams.get('c__applicationId'),
      clientToken: searchParams.get('c__clientToken'),
      env: searchParams.get('c__env'),
      service: searchParams.get('c__service'),
      site: searchParams.get('c__site'),
      ...defaultDatadogRumConfig,
      ...this.getQueryInitConfiguration(searchParams),
    }
  }

  getQueryInitConfiguration(searchParams) {
    const configuration = searchParams.get('c__datadogInitConfiguration')
    if (!configuration) {
      return {}
    }

    try {
      return JSON.parse(configuration)
    } catch (error) {
      window.console.warn('Invalid Datadog init configuration query parameter', error)
      return {}
    }
  }
}
