import { noop } from './utils/functionUtils'
import type { Injector } from './injector'
import { createInjector } from './injector'

const enum MyComponents {
  foo,
  bar,
}

type Foo = ReturnType<typeof initFoo>
function initFoo(bar: Bar) {
  return {
    key: `foo+${bar.key}`,
    stop: noop,
  }
}

initFoo.$id = MyComponents.foo
initFoo.$deps = [MyComponents.bar]

type Bar = ReturnType<typeof initBar>
function initBar() {
  return {
    key: 'bar',
  }
}
initBar.$id = MyComponents.bar

describe('injector', () => {
  let injector: Injector

  beforeEach(() => {
    injector = createInjector()
    injector.register(initFoo, initBar)
  })

  it('should init component with its dependencies', () => {
    expect(injector.get<Foo>(MyComponents.foo).key).toBe('foo+bar')
  })

  it('should override context with a stub component', () => {
    injector.define<Bar>(MyComponents.bar, {
      key: 'qux',
    })
    expect(injector.get<Foo>(MyComponents.foo).key).toBe('foo+qux')
  })
})
