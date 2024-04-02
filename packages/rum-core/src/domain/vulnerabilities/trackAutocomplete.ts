
import { VulnerabilityType, type Observable, type Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';

export function trackAutocomplete(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    const forms = document.querySelectorAll<HTMLFormElement>('form')

    forms.forEach(form => {
      const formAutocompleteAttr = form.getAttribute('autocomplete')
      analyze(formAutocompleteAttr, form, vulnerabilityObservable, view.location)

      const elements = form.querySelectorAll<HTMLElement>('input, textarea, select')
      elements.forEach(element => {
        analyze(element.getAttribute('autocomplete'), element, vulnerabilityObservable, view.location, formAutocompleteAttr)
      })
    })
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

function analyze(
  autocompleteAttr: string | null,
  element: HTMLElement,
  vulnerabilityObservable: Observable<Vulnerability>,
  location: Location,
  parentAutocompleteAttr?: string | null
) {
  if (autocompleteAttr === 'on' || (autocompleteAttr === null && parentAutocompleteAttr !== 'off')) {
    vulnerabilityObservable.notify({
      type: VulnerabilityType.AUTOCOMPLETE_MISSING,
      element,
      location
    })
  } 
}