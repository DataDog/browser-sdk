import { LightningElement, wire, api } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRum from '@salesforce/resourceUrl/datadog_rum_salesforce_sr'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env

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
    return loadScript(this, datadogRum).then(() => {
      if (window.RUM_CONTEXT) {
        window.DD_RUM.setGlobalContext(window.RUM_CONTEXT)
      }
      window.DD_RUM.init({
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        site: this.site,
        service: this.service,
        env: this.env,
        sessionSampleRate: 100,
        sessionReplaySampleRate: 100,
        trackViewsManually: true,
        ...window.RUM_CONFIGURATION,
      })
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
