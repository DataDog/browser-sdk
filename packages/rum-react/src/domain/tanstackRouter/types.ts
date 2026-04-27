// Those types are used by our instrumentation functions to make them work with
// TanStack Router without directly importing its types. This avoids version coupling
// and ensures compatibility across TanStack Router v1 releases.
//
// Those types should be:
// * compatible with all @tanstack/react-router v1 versions we support
// * include the minimal set of attributes used by our instrumentation functions.

export interface AnyTanStackRouteMatch {
  fullPath: string
  pathname: string
  params: Record<string, string | undefined>
}

export interface AnyTanStackNavigationEvent {
  type: string
  pathChanged: boolean
  toLocation: { pathname: string }
}

export interface AnyTanStackRouterInstance {
  state: {
    location: { pathname: string }
    matches: AnyTanStackRouteMatch[]
  }
  subscribe: (eventType: 'onLoad', fn: (event: AnyTanStackNavigationEvent) => void) => () => void
}

export type AnyTanStackCreateRouter = (options: any) => AnyTanStackRouterInstance
