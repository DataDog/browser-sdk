export type Component = any
// number and string to be compatible with enum and keys manipulation
export type ComponentId = number | string

export type ComponentFactory = ((...args: any[]) => Component) & {
  $id: ComponentId
  $deps?: ComponentId[]
}

export interface Injector {
  register: (...factories: ComponentFactory[]) => void
  get: <T extends Component>(componentId: ComponentId) => T
  define: <T extends Component>(componentId: ComponentId, component: T) => void
  stop: () => void
}

export function createInjector(): Injector {
  const factories: { [key: ComponentId]: ComponentFactory } = {}
  const context: { [key: ComponentId]: Component } = {}

  const injector = {
    register(...newFactories: ComponentFactory[]) {
      newFactories.forEach((factory) => {
        factories[factory.$id] = factory
      })
    },

    get<T extends Component>(componentId: ComponentId) {
      if (!context[componentId]) {
        const factory = factories[componentId]
        context[componentId] = factory.call(null, ...(factory.$deps || []).map(injector.get.bind(injector)))
      }
      return context[componentId] as T
    },

    define<T extends Component>(componentId: ComponentId, component: T) {
      context[componentId] = component
    },

    stop() {
      Object.keys(context).forEach((componentId) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        context[componentId]?.stop?.()
        delete context[componentId]
      })
    },
  }

  return injector
}
