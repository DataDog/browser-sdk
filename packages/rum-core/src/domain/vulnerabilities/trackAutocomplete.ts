
import type { Vulnerability } from '@datadog/browser-core';
import type { LifeCycle} from '../lifeCycle';
import { LifeCycleEventType } from '../lifeCycle';


export function trackAutocomplete(lifeCycle: LifeCycle, vulnerabilityObservable: Observable<Vulnerability>) {
  lifeCycle.subscribe(LifeCycleEventType.VIEW_UPDATED, (view) => {
    const forms = document.querySelectorAll<HTMLFormElement>('form')

    forms.forEach(form => {
      console.log(`form ${form.name} autocomplete: ${form.getAttribute('autocomplete')}`, form)

      const inputs = form.querySelectorAll('input')
      inputs.forEach(input => {
        console.log(` - input ${input.name} autocomplete: ${input.getAttribute('autocomplete')}`, input)
      })
    })
  })
}