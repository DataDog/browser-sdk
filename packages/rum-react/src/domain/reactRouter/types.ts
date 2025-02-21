// Those types are used by our instrumentation functions to make them work with any react-router
// version we support. We should not import react-router types as we don't know which version
// will be used by the customer.
//
// Those types should be:
// * compatible with all react-router-dom versions we support
// * include the minimal set of attributes used by our instrumentation functions.

export type AnyRouteObject = {
  path?: string | undefined
  element?: React.ReactNode
}
export type AnyUseRoute<Location extends AnyLocation> = (
  routes: AnyRouteObject[],
  location?: Location
) => React.ReactElement | null
export type AnyRouteMatch = { route: AnyRouteObject; params: Record<string, string | undefined> }
export type AnyLocation = { pathname: string } | string
export type AnyCreateRouter<Options> = (
  routes: AnyRouteObject[],
  options?: Options
) => {
  state: { location: { pathname: string }; matches: AnyRouteMatch[] }
  subscribe: (callback: (routerState: { location: { pathname: string }; matches: AnyRouteMatch[] }) => void) => void
}
