export type AnyRouteObject = { path?: string | undefined }
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
