
import { VulnerabilityType, type Observable, type Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';

export function trackAutocomplete(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    const forms = document.querySelectorAll<HTMLFormElement>('form')

    forms.forEach(form => {
      analyze(form.getAttribute('autocomplete'), form, vulnerabilityObservable, view.location)

      const elements = form.querySelectorAll<HTMLElement>('input, textarea, select')
      elements.forEach(element => {
        analyze(element.getAttribute('autocomplete'), element, vulnerabilityObservable, view.location)
      })
    })
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

function analyze(autocompleteAttr: string | null,
  element: HTMLElement,
  vulnerabilityObservable: Observable<Vulnerability>,
  location: Location
) {
  if (autocompleteAttr !== 'off') {
    vulnerabilityObservable.notify({
      type: VulnerabilityType.AUTOCOMPLETE_MISSING,

      // TODO: obtain location: file, line, column...
      element,

      location
    })
  }
}
