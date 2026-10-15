declare module 'lib/lib' {
  export function boom(id: string): never
}

interface Window {
  nativeXhrOpen: XMLHttpRequest['open']
  DD_RUM: {
    attachElementStack: (element: Element) => void
    addError: (error: Error) => void
    addAction: (name: string, context?: any) => void
    startDurationVital: (name: string, options?: { vitalKey?: string }) => void
    stopDurationVital: (name: string, options?: { vitalKey?: string }) => void
    startOperation: (name: string) => void
    startView: (options: { name: string }) => void
  }
}
