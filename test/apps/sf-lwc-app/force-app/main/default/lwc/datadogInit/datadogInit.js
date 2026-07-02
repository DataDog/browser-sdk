import { LightningElement, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import datadogRumSlim from '@salesforce/resourceUrl/datadog_rum_slim'
import { loadScript } from 'lightning/platformResourceLoader'

let datadogInitialization
let lastStartedUrl

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

    return loadScript(this, datadogRumSlim).then(() => {
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
      ...window.dd_RUM_CONFIGURATION,
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
