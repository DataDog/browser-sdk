import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

const defaultDatadogRumConfig = {
  trackViewsManually: true,
  trackEarlyRequests: true,
  trackLongTasks: true,
  trackResources: true,
  trackUserInteractions: true,
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
      window.DD_RUM.init({
        applicationId: searchParams.get('c__applicationId'),
        clientToken: searchParams.get('c__clientToken'),
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
