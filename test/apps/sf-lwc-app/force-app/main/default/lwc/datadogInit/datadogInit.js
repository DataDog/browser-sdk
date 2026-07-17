import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

const defaultInitConfiguration = {
  applicationId: 'xxx',
  clientToken: 'xxx',
  site: 'datadoghq.com',
}

export default class DatadogInit extends NavigationMixin(LightningElement) {
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

  connectedCallback() {
    this.initialize()
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
      window.DD_RUM.setGlobalContext(window.RUM_CONTEXT)
      window.DD_RUM.init({ ...defaultInitConfiguration, ...window.RUM_CONFIGURATION })
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
