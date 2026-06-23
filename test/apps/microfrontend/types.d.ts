interface Window {
  OO_RUM: {
    addError: (error: Error) => void
    addAction: (name: string, context?: any) => void
    startDurationVital: (name: string, options?: { vitalKey?: string }) => void
    stopDurationVital: (name: string, options?: { vitalKey?: string }) => void
    startOperation: (name: string) => void
    startView: (options: { name: string }) => void
  }
}
