import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type Params = Record<string, string | string[]>

interface NavigationState {
  pathname: string
  params: Params
}

interface NavigationContextType extends NavigationState {
  navigate: (pathname: string, params?: Params) => void
}

const NavigationContext = createContext<NavigationContextType>({
  pathname: '/',
  params: {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  navigate: (_pathname: string, _params?: Params) => {},
})

export function usePathname(): string {
  return useContext(NavigationContext).pathname
}

export function useParams(): Params {
  return useContext(NavigationContext).params
}

export function useNavigate() {
  return useContext(NavigationContext).navigate
}

export function NavigationProvider({
  children,
  initialPathname = '/',
}: {
  children: ReactNode
  initialPathname?: string
}) {
  const [state, setState] = useState<NavigationState>({ pathname: initialPathname, params: {} })
  const navigate = useCallback((pathname: string, params: Params = {}) => {
    setState({ pathname, params })
  }, [])

  return <NavigationContext.Provider value={{ ...state, navigate }}>{children}</NavigationContext.Provider>
}
