import express from 'express'

const nextCursor = 'my-cursor'

export interface DebuggerHttpApiControl {
  setDebuggerProbes(probes: object[]): void
}

export function createDebuggerHttpApi(): { router: express.Router; control: DebuggerHttpApiControl } {
  let debuggerProbes: object[] = []

  const router = express.Router()

  router.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json({ nextCursor, updates: debuggerProbes, deletions: [] })
  })

  return {
    router,
    control: {
      setDebuggerProbes(probes) {
        debuggerProbes = probes
      },
    },
  }
}
