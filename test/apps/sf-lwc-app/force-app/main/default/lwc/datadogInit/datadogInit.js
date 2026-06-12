import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId = '1397744d-34f4-4a6a-a735-801e31c18221'
  @api clientToken = 'pub2ad3fe2578f01b9f329bd0ea4a2f08c5'
  @api site = 'datadoghq.com'
  @api service = 'my-salesforce-app'
  @api env = 'dev'
  @api trackViewsManually

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
      const initConfig = {
        applicationId: this.applicationId,
        clientToken: this.clientToken,
        env: this.env,
        service: this.service,
        site: this.site,
        trackViewsManually: true,
        trackEarlyRequests: true,
        trackLongTasks: true,
        trackResources: true,
        trackUserInteractions: true,
      }
      window.DD_RUM.init(initConfig)
      lastStartedUrl = window.location.pathname + window.location.search + window.location.hash
      window.DD_RUM.startView({
        name: lastStartedUrl,
        url: window.location.href,
      })
    })
  }
}
