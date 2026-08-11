import express from 'express'

const nextCursor = 'my-cursor'

export interface DebuggerProbeResponse {
  nextCursor: string
  updates: object[]
  deletions: string[]
}

export interface DebuggerHttpApiControl {
  setDebuggerProbes(probes: object[]): void
  setDebuggerProbeResponse(response: Partial<DebuggerProbeResponse>): void
}

export function createDebuggerHttpApi(): { router: express.Router; control: DebuggerHttpApiControl } {
  let debuggerProbeResponse: DebuggerProbeResponse = { nextCursor, updates: [], deletions: [] }

  const router = express.Router()

  router.post('/api/unstable/debugger/frontend/probes', (_req, res) => {
    res.json(debuggerProbeResponse)
  })

  return {
    router,
    control: {
      setDebuggerProbes(probes) {
        debuggerProbeResponse = { nextCursor, updates: probes, deletions: [] }
      },
      setDebuggerProbeResponse(response) {
        debuggerProbeResponse = {
          nextCursor: response.nextCursor ?? nextCursor,
          updates: response.updates ?? [],
          deletions: response.deletions ?? [],
        }
      },
    },
  }
}
