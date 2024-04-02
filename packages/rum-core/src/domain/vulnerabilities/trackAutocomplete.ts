
import { VulnerabilityType, type Observable, type Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';


export function trackAutocomplete(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, () => {
    const forms = document.querySelectorAll<HTMLFormElement>('form')

    forms.forEach(form => {
      notifyAutocomplete(form.getAttribute('autocomplete'), form, vulnerabilityObservable)

      const elements = form.querySelectorAll<HTMLElement>('input, textarea, select')
      elements.forEach(element => {
        notifyAutocomplete(element.getAttribute('autocomplete'), element, vulnerabilityObservable)
      })
    })
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

function notifyAutocomplete(autocompleteValue: string | null, element: HTMLElement, vulnerabilityObservable: Observable<Vulnerability>) {
  if (autocompleteValue === 'on') {
    vulnerabilityObservable.notify({
      type: VulnerabilityType.AUTOCOMPLETE,

      // TODO: obtain location: file, line, column...
      element
    })
  }
}
