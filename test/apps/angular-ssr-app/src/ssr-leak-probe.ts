import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

// Test-only: lets test/e2e/scenario/plugins/ssr.scenario.ts check that server renders don't stay in
// memory (https://github.com/DataDog/browser-sdk/issues/5193)

// Shared through globalThis: the server entry (server.ts) and the application are bundled into
// separate chunks, each with its own copy of this module
const probe = ((
  globalThis as { ssrLeakProbe?: { renders: Set<WeakRef<object>>; trackedRenders: number } }
).ssrLeakProbe ??= { renders: new Set(), trackedRenders: 0 })

export function trackRender(render: object) {
  probe.renders.add(new WeakRef(render))
  probe.trackedRenders++
}

export async function getSsrLeakReport() {
  // Let the last render finish its cleanup
  await new Promise((resolve) => setTimeout(resolve))
  setFlagsFromString('--expose-gc')
  ;(runInNewContext('gc') as () => void)()
  for (const ref of probe.renders) {
    if (!ref.deref()) {
      probe.renders.delete(ref)
    }
  }
  return { aliveRenders: probe.renders.size, trackedRenders: probe.trackedRenders }
}
