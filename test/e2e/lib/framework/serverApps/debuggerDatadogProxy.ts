import type { Express } from 'express'

const nextCursor = 'my-cursor'

export interface DebuggerDatadogProxyControl {
  setDebuggerProbes(probes: object[]): void
}

interface DatadogProxy<TControl extends object> {
  app: Express
  control: TControl
}

export function addDebuggerDatadogProxy<TControl extends object>({
  app,
  control = {} as TControl,
}: {
  app: Express
  control?: TControl
}): DatadogProxy<TControl & { debugger: DebuggerDatadogProxyControl }> {
  let debuggerProbes: object[] = []

  app.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json({ nextCursor, updates: debuggerProbes, deletions: [] })
  })

  return {
    app,
    control: {
      ...control,
      debugger: {
        setDebuggerProbes(probes) {
          debuggerProbes = probes
        },
      },
    },
  }
}
