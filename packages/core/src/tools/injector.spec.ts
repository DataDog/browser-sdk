import { noop } from './utils/functionUtils'
import type { Component, Injector } from './injector'
import { createInjector } from './injector'

type Foo = { key: string; stop: () => void }
const initFoo: Component<Foo, [Bar]> = (bar) => ({
  key: `foo+${bar.key}`,
  stop: noop,
})

initFoo.$deps = [initBar]

type Bar = ReturnType<typeof initBar>
function initBar() {
  return {
    key: 'bar',
  }
}

describe('injector', () => {
  let injector: Injector

  beforeEach(() => {
    injector = createInjector()
  })

  it('should init component with its dependencies', () => {
    expect(injector.run(initFoo).key).toBe('foo+bar')
  })

  it('should override context with a stub component', () => {
    injector.override(initBar, () => ({
      key: 'qux',
    }))
    expect(injector.run(initFoo).key).toBe('foo+qux')
  })
})
