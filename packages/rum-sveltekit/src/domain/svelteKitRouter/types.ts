export interface NavigationTarget {
  url: URL
  route: { id: string | null }
  params: Record<string, string>
}

export interface Navigation {
  from: NavigationTarget | null
  to: NavigationTarget | null
  type: 'enter' | 'form' | 'leave' | 'link' | 'goto' | 'popstate'
  willUnload: boolean
  complete: Promise<void>
}
