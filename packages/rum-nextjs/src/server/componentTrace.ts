import { isEdgeRuntime, createEdgeTracer } from './edgeRuntime'

interface ComponentTraceContext {
  componentName: string
}

interface Store {
  run<T>(context: ComponentTraceContext, fn: () => T): T
  getStore(): ComponentTraceContext | undefined
}

let store: Store | undefined

/**
 * Initialises the component trace store with an AsyncLocalStorage instance.
 * Called by the server component loader which imports AsyncLocalStorage at the
 * app level (where bundlers resolve node: built-ins correctly).
 */
export function initComponentTraceStore(AsyncLocalStorage: { new (): Store }) {
  if (!store) {
    store = new AsyncLocalStorage()
  }
}

/**
 * Allows tests to inject a mock store implementation.
 * @internal
 */
export function setComponentTraceStoreForTesting(mockStore: Store | undefined) {
  store = mockStore
}

/**
 * Returns the current component trace context, if any.
 * Can be used to read the active component name from within fetch interceptors.
 */
export function getComponentTraceContext(): ComponentTraceContext | undefined {
  return store?.getStore()
}

/**
 * Wraps a React Server Component to create a tracing span around its execution.
 *
 * In Node.js runtime, it uses dd-trace to create a parent span so that fetch calls
 * within the component automatically appear as child spans in APM traces.
 *
 * In Edge runtime, it uses the lightweight edge tracer to create a standalone span.
 *
 * @param componentName - The name to use for the span (e.g. 'UserProfile')
 * @param Component - The async server component function to wrap
 */
export function withComponentTrace<P>(
  componentName: string,
  Component: (props: P) => Promise<React.ReactElement | null>
): (props: P) => Promise<React.ReactElement | null> {
  return async (props: P) => {
    if (!store) {
      // Store not initialised — run the component without tracing
      return Component(props)
    }
    return store.run({ componentName }, () => {
      if (!isEdgeRuntime()) {
        return traceWithDdTrace(componentName, Component, props)
      }
      return traceWithEdgeTracer(componentName, Component, props)
    })
  }
}

// Use an indirect require that bundlers cannot statically analyse.
// eslint-disable-next-line no-eval
const serverRequire = eval('require') as NodeRequire

async function traceWithDdTrace<P>(
  componentName: string,
  Component: (props: P) => Promise<React.ReactElement | null>,
  props: P
): Promise<React.ReactElement | null> {
  try {
    const ddTrace = serverRequire('dd-trace') as { default?: any; trace: any }
    const tracer = ddTrace.default ?? ddTrace

    return await tracer.trace(
      'react.server_component',
      {
        resource: componentName,
        tags: {
          'component.name': componentName,
        },
      },
      () => Component(props)
    )
  } catch {
    // dd-trace not available — fall through to direct execution
    return Component(props)
  }
}

async function traceWithEdgeTracer<P>(
  componentName: string,
  Component: (props: P) => Promise<React.ReactElement | null>,
  props: P
): Promise<React.ReactElement | null> {
  const tracer = createEdgeTracer()
  const span = tracer.startSpan('react.server_component', {
    tags: {
      'resource.name': componentName,
      'component.name': componentName,
    },
  })

  try {
    const result = await Component(props)
    span.finish()
    return result
  } catch (error) {
    span.setTag('error', error)
    span.finish()
    throw error
  }
}
