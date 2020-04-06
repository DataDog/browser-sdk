import { isIE } from '@datadog/browser-core'
import { startDOMMutationCollection } from '../src/domMutationCollection'
import { LifeCycle, LifeCycleEventType } from '../src/lifeCycle'

describe('domMutationCollection', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('dom mutation not available')
    }
  })

  function domMutationSpec(mutate: (root: HTMLElement) => void, { expectedMutations }: { expectedMutations: number }) {
    return (done: DoneFn) => {
      const root = document.createElement('div')
      root.setAttribute('data-test', 'foo')
      document.body.appendChild(root)

      const lifeCycle = new LifeCycle()

      let counter = 0
      lifeCycle.subscribe(LifeCycleEventType.DOM_MUTATED, () => {
        counter += 1
      })

      startDOMMutationCollection(lifeCycle)

      mutate(root)

      setTimeout(() => {
        expect(counter).toBe(expectedMutations)
        root.parentNode!.removeChild(root)
        done()
      }, 16)
    }
  }

  it(
    'collects DOM mutation on Element',
    domMutationSpec(
      (root) => {
        root.appendChild(document.createElement('button'))
      },
      { expectedMutations: 1 }
    )
  )

  it(
    'collects DOM mutation on Text creation',
    domMutationSpec(
      (root) => {
        root.appendChild(document.createTextNode('foo'))
      },
      { expectedMutations: 1 }
    )
  )

  it(
    'collects DOM mutation on attribute creation',
    domMutationSpec(
      (root) => {
        root.setAttribute('data-test2', 'bar')
      },
      { expectedMutations: 1 }
    )
  )

  it(
    'collects DOM mutation on attribute change',
    domMutationSpec(
      (root) => {
        root.setAttribute('data-test', 'bar')
      },
      { expectedMutations: 1 }
    )
  )
})
