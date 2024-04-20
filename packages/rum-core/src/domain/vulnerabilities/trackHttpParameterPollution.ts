
import { VulnerabilityType, type Observable, type Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';

export function trackHttpParameterPollution(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    const forms = document.querySelectorAll<HTMLFormElement>('form')

    forms.forEach(form => analyze(form, vulnerabilityObservable, view.location))
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

function analyze(
  element: HTMLFormElement,
  vulnerabilityObservable: Observable<Vulnerability>,
  location: Location
) {
  if (!element.getAttribute('action')) {
    vulnerabilityObservable.notify({
      type: VulnerabilityType.HTTP_PARAMETER_POLLUTION,
      element,
      location
    })
  } 
}
