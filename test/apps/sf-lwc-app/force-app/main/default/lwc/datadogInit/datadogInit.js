import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

const datadogRumConfig = {
  applicationId: '1397744d-34f4-4a6a-a735-801e31c18221',
  clientToken: 'pub2ad3fe2578f01b9f329bd0ea4a2f08c5',
  env: 'dev',
  service: 'browser-sdk-sandbox',
  site: 'datadoghq.com',
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
      window.DD_RUM.init(datadogRumConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
