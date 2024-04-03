import { VulnerabilityType, type Observable, type Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';

export function trackSri(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  const subscription = lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    const scripts = document.querySelectorAll<HTMLElement>('script')
    scripts.forEach(script => {
      if (script.getAttribute('src')) {
        analyze(script, vulnerabilityObservable, view.location)
      }
    })

    const links = document.querySelectorAll<HTMLElement>('link')
    links.forEach(link => {
      if (link.getAttribute('href')) {
        const rel = link.getAttribute('rel')
        if (rel === 'stylesheet' || rel === 'preload' || rel === 'modulepreload') {
          analyze(link, vulnerabilityObservable, view.location)
        }
      }
    })
  })

  return {
    stop: () => {
      subscription.unsubscribe()
    },
  }
}

function analyze(
  element: HTMLElement,
  vulnerabilityObservable: Observable<Vulnerability>,
  location: Location,
) {
  const integrityAttr = element.getAttribute('integrity')

  if (!integrityAttr) {
    vulnerabilityObservable.notify({
      type: VulnerabilityType.SRI_MISSING,
      element,
      location
    })
  } 
}
