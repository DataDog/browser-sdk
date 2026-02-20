// declare module 'app1/app1'
// declare module 'app2/app2'

interface Window {
  DD_RUM: {
    addError: (error: Error) => void
    addAction: (name: string, context?: any) => void
    startDurationVital: (name: string) => any
    stopDurationVital: (ref: any) => void
    startView: (options: { name: string }) => void
  }
}
