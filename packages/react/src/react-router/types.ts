export type Location = {
  pathname: string
  search: string
  hash: string
}

export type RouterState = {
  location: Location
  matches: RouteMatch[]
}

export type Router = {
  subscribe: (fn: (state: RouterState) => void) => void
}

export type RouteMatch = {
  route: {
    path?: string
  }
}
