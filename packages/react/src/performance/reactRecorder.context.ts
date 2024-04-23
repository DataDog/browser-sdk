import React from 'react'

interface ReactRecorderContextType {
  id?: string | number
}

export const ReactRecorderContext = React.createContext<ReactRecorderContextType>({})
