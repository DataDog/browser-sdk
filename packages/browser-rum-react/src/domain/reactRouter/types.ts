// Those types are used by our instrumentation functions to make them work with any react-router
// version we support. We should not import react-router types as we don't know which version
// will be used by the customer.
//
// Those types should be:
// * compatible with all react-router-dom versions we support
// * include the minimal set of attributes used by our instrumentation functions.

export interface AnyRouteObject {
  path?: string | undefined
  element?: React.ReactNode
}
export type AnyUseRoute<Location extends AnyLocation> = (
  routes: AnyRouteObject[],
  location?: Location
) => React.ReactElement | null
export interface AnyRouteMatch {
  route: AnyRouteObject
  params: Record<string, string | undefined>
}
export type AnyLocation = { pathname?: string } | string
// Opaque second arg to subscriber callbacks — forwarded verbatim when replaying
// initial-error notifications to subscribers that attach after us.
export type AnyRouterSubscriberOpts = Record<string, unknown>
export type AnyRouterSubscriber = (
  routerState: { location: { pathname: string }; matches: AnyRouteMatch[] },
  opts?: AnyRouterSubscriberOpts
) => void

export interface AnyRouter {
  state: { location: { pathname: string }; matches: AnyRouteMatch[] }
  subscribe: (callback: AnyRouterSubscriber) => () => void
}

export type AnyCreateRouter<Options> = (routes: AnyRouteObject[], options?: Options) => AnyRouter
