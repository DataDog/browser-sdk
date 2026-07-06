import { LightningElement, track } from 'lwc'

export default class ExperienceSecondPageActions extends LightningElement {
  @track lastResourceName
  @track lastSelectorProbe

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
