import { LightningElement, track } from 'lwc'

export default class ExperienceHomeActions extends LightningElement {
  @track lastActionName
  @track lastErrorName
  @track lastResourceName
  @track lastSelectorProbe

  get homeHref() {
    return `./${window.location.search}`
  }

  get productExplorerHref() {
    return `product-explorer${window.location.search}`
  }

  handleActionClick(event) {
    const actionName = event.currentTarget.dataset.actionName
    this.lastActionName = actionName

    window.DD_RUM?.addAction(actionName, {
      source: 'salesforce-experience-home-button',
      pathname: window.location?.pathname,
    })
  }

  handleErrorClick(event) {
    const errorName = event.currentTarget.dataset.errorName
    this.lastErrorName = errorName

    window.DD_RUM?.addError(new Error(errorName), {
      source: 'salesforce-experience-home-button',
      pathname: window.location?.pathname,
    })
  }

  handleRuntimeErrorClick() {
    throw new Error('salesforce direct runtime error test')
  }

  handleLongTaskClick() {
    window.setTimeout(() => {
      const start = performance.now()
      while (performance.now() - start < 750) {
        /* spin */
      }
    }, 0)
  }

  // Vitals: report a completed duration vital directly.
  handleAddDurationVitalClick() {
    window.DD_RUM?.addDurationVital('salesforce.experience_duration_vital_test', {
      startTime: Date.now() - 250,
      duration: 250,
      description: 'salesforce experience duration vital test',
      context: {
        source: 'salesforce-experience-second-page-button',
      },
    })
  }

  // Vitals: measure a live 300ms window.
  handleStartStopVitalClick() {
    window.DD_RUM?.startDurationVital('salesforce.experience_start_stop_vital_test', {
      description: 'salesforce experience start-stop vital test',
      context: {
        source: 'salesforce-experience-second-page-button',
      },
    })

    setTimeout(() => window.DD_RUM?.stopDurationVital('salesforce.experience_start_stop_vital_test'), 300)
  }

  async handleFetchResourceClick() {
    const token = `dd-fetch-test-${Date.now()}`
    const url = this.getResourceTestUrl(token)
    this.lastResourceName = `fetch: ${token}`

    try {
      const response = await window.fetch(url, { cache: 'no-store' })
      await response.text()
    } catch (error) {
      window.DD_RUM?.addError(error, {
        source: 'salesforce-experience-resource-button',
        resourceType: 'fetch',
        url,
      })
    }
  }

  handleXhrResourceClick() {
    const token = `dd-xhr-test-${Date.now()}`
    const url = this.getResourceTestUrl(token)
    this.lastResourceName = `xhr: ${token}`

    const xhr = new window.XMLHttpRequest()
    xhr.open('GET', url)
    xhr.onerror = () => {
      window.DD_RUM?.addError(new Error('salesforce experience xhr resource test failed'), {
        source: 'salesforce-experience-resource-button',
        resourceType: 'xhr',
        url,
      })
    }
    xhr.send()
  }

  handleImageResourceClick() {
    const token = `dd-image-test-${Date.now()}`
    const url = this.getResourceTestUrl(token)
    this.lastResourceName = `image: ${token}`

    const image = new Image()
    image.src = url
    this.resourceImage = image
  }

  handleSelectorProbeClick(event) {
    const innerActionName = event.currentTarget.getAttribute('data-dd-action-name')
    this.lastSelectorProbe = innerActionName

    window.DD_RUM?.addAction('selector probe internal target', {
      source: 'salesforce-experience-selector-probe',
      currentTargetActionName: innerActionName,
      currentTargetTagName: event.currentTarget.tagName,
      targetTagName: event.target.tagName,
      composedPath: this.getComposedPathNames(event),
    })
  }

  getResourceTestUrl(token) {
    return `${window.location.origin}/services/data/?${token}`
  }

  getComposedPathNames(event) {
    return event
      .composedPath()
      .slice(0, 6)
      .map((target) => target.tagName || target.nodeName || String(target))
  }
}
