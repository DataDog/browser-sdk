import { LightningElement, track } from 'lwc'

export default class ExperienceHomeActions extends LightningElement {
  @track lastActionName
  @track lastErrorName

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
    throw new Error('salesforce experience direct runtime error test')
  }

  handleLongTaskClick() {
    window.setTimeout(() => {
      const start = performance.now()
      while (performance.now() - start < 750) {
        /* spin */
      }
    }, 0)
  }
}
