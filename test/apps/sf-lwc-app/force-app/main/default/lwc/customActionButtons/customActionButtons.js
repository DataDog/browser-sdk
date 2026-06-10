import { LightningElement, track } from 'lwc'

export default class CustomActionButtons extends LightningElement {
  @track lastActionName
  @track lastErrorName
  @track lastResourceName
  @track lastSelectorProbe

  handleActionClick(event) {
    const actionName = event.currentTarget.dataset.actionName
    this.lastActionName = actionName

    window.DD_RUM?.addAction(actionName, {
      source: 'salesforce-home-button',
      pathname: window.location?.pathname,
    })
  }

  handleErrorClick(event) {
    const errorName = event.currentTarget.dataset.errorName
    this.lastErrorName = errorName

    window.DD_RUM?.addError(new Error(errorName), {
      source: 'salesforce-home-button',
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
    window.DD_RUM?.addDurationVital('salesforce.duration_vital_test', {
      startTime: Date.now() - 250,
      duration: 250,
      description: 'salesforce duration vital test',
      context: {
        source: 'salesforce-home-button',
      },
    })
  }

  // Vitals: measure a live 300ms window.
  handleStartStopVitalClick() {
    const vital = window.DD_RUM?.startDurationVital('salesforce.start_stop_vital_test', {
      description: 'salesforce start-stop vital test',
      context: {
        source: 'salesforce-home-button',
      },
    })

    setTimeout(() => window.DD_RUM?.stopDurationVital(vital), 300)
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
        source: 'salesforce-resource-button',
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
      window.DD_RUM?.addError(new Error('salesforce xhr resource test failed'), {
        source: 'salesforce-resource-button',
        resourceType: 'xhr',
        url,
      })
    }
    xhr.send()
  }

  handleSelectorProbeClick(event) {
    const innerActionName = event.currentTarget.getAttribute('data-dd-action-name')
    this.lastSelectorProbe = innerActionName

    window.DD_RUM?.addAction('selector probe internal target', {
      source: 'salesforce-selector-probe',
      currentTargetActionName: innerActionName,
      currentTargetTagName: event.currentTarget.tagName,
      targetTagName: event.target.tagName,
      composedPath: this.getComposedPathNames(event),
    })
  }

  getResourceTestUrl(token) {
    return `https://dummyjson.com/products/1?${token}`
  }

  getComposedPathNames(event) {
    return event
      .composedPath()
      .slice(0, 6)
      .map((target) => target.tagName || target.nodeName || String(target))
  }
}
