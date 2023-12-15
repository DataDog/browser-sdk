export interface Component<Instance, Deps extends any[]> {
  (...args: Deps): Instance
  $deps: Readonly<{ [K in keyof Deps]: AnyComponent<Deps[K]> }>
}

interface SimpleComponent<Instance> {
  (): Instance
}

export type AnyComponent<Instance> = Component<Instance, any> | SimpleComponent<Instance>

export interface Injector {
  run: <T>(component: AnyComponent<T>) => T
  get: <T>(component: AnyComponent<T>) => T
  override: <T>(originalComponent: AnyComponent<T>, newComponent: AnyComponent<T>) => void
  stop: () => void
}

export function createInjector(): Injector {
  const instances = new Map<AnyComponent<any>, any>()
  const overrides = new Map<AnyComponent<any>, AnyComponent<any>>()
  overrides.set(getInjector, () => injector)

  const injector: Injector = {
    run(component) {
      if (instances.has(component)) {
        throw new Error(`Component ${component.name} already started`)
      }
      if (overrides.has(component)) {
        component = overrides.get(component)!
      }

      const args = ('$deps' in component ? component.$deps : []).map((dependency): any =>
        instances.has(dependency) ? instances.get(dependency) : injector.run(dependency)
      )

      const instance: any = component(...args)

      instances.set(component, instance)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return instance
    },

    get<T>(component: AnyComponent<T>) {
      if (!instances.has(component)) {
        throw new Error(`Component ${component.name} not started`)
      }
      return instances.get(component) as T
    },

    override(originalComponent, newComponent) {
      if (instances.has(originalComponent)) {
        throw new Error(`Component ${originalComponent.name} already started`)
      }
      overrides.set(originalComponent, newComponent)
    },

    stop() {
      instances.forEach((instance) => {
        if (instance !== injector && instance?.stop) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          instance.stop()
        }
      })
      instances.clear()
    },
  }

  return injector
}

export function getInjector(): Injector {
  throw new Error('No injector available')
}
