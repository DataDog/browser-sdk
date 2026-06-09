import { LightningElement, api, wire } from 'lwc'
import { NavigationMixin, CurrentPageReference } from 'lightning/navigation'
import { loadScript } from 'lightning/platformResourceLoader'

const DEFAULT_STATIC_RESOURCE_NAME = 'datadog_rum_salesforce'
const E2E_CONFIG_HASH_PARAMETER = 'dd_sf_e2e'

let datadogInitialization
let lastStartedUrl

export default class DatadogInit extends NavigationMixin(LightningElement) {
  @api applicationId
  @api clientToken
  @api site
  @api service
  @api env
  @api allowedTracingUrls
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
    const config = getBundleConfigFromUrl()

    return loadScript(this, buildStaticResourceUrl(config)).then(() => {
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
      if (config.sha) {
        initConfig.version = config.sha
      }
      if (config.proxy) {
        initConfig.proxy = config.proxy
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

function buildStaticResourceUrl(config) {
  const resourceName = config.resourceName || DEFAULT_STATIC_RESOURCE_NAME
  const resourceUrl = new URL(`/resource/${resourceName}`, window.location.origin)

  if (config.sha) {
    resourceUrl.searchParams.set('dd_ci_sha', config.sha)
  }

  return resourceUrl.pathname + resourceUrl.search
}

function getBundleConfigFromUrl() {
  const rawConfig = getHashParameter(E2E_CONFIG_HASH_PARAMETER)
  if (!rawConfig) {
    return {}
  }

  if (rawConfig.startsWith('{')) {
    return JSON.parse(rawConfig)
  }

  const [resourceName, sha] = rawConfig.split(':')
  return { resourceName, sha }
}

function getHashParameter(name) {
  return new URLSearchParams(window.location.hash.slice(1)).get(name)
}
