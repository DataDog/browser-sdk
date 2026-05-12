interface Window {
  DD_RUM: {
    addError: (error: Error) => void
    addAction: (name: string, context?: any) => void
    startDurationVital: (name: string, options?: { vitalKey?: string }) => void
    stopDurationVital: (name: string, options?: { vitalKey?: string }) => void
    startFeatureOperation: (name: string) => void
    startView: (options: { name: string }) => void
  }
}
