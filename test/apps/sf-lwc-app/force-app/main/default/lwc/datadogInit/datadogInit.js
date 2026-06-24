import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

const DATADOG_PARAMS = ['c__applicationId', 'c__clientToken', 'c__env', 'c__service', 'c__site']

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
    return loadScript(this, datadogRumSlim).then(() => {
      const searchParams = new URLSearchParams(window.location.search)
      const applicationId = searchParams.get('c__applicationId')
      const clientToken = searchParams.get('c__clientToken')

      if (!applicationId || !clientToken) {
        window.console.warn('Datadog RUM not initialized: missing c__applicationId or c__clientToken')
        return
      }

      window.DD_RUM.init({
        applicationId,
        clientToken,
        env: searchParams.get('c__env'),
        service: searchParams.get('c__service'),
        site: searchParams.get('c__site'),
        ...defaultDatadogRumConfig,
      })
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
