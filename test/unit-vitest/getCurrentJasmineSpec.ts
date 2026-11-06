import { beforeEach, onTestFinished } from 'vitest'

let currentSpec: { fullName: string } | null = null

export function getCurrentJasmineSpec() {
  return currentSpec
}

/**
 * Called from the setup file, which runs for every test file. Hooks registered when this module is
 * evaluated would only apply to the first test file when files share the same page (`isolate:
 * false`).
 */
export function trackCurrentJasmineSpec() {
  beforeEach((context) => {
    const parts: string[] = []
    let current: any = context.task
    while (current) {
      if (current.name) {
        parts.unshift(current.name)
      }
      current = current.suite
    }
    currentSpec = { fullName: parts.join(' ') }

    onTestFinished(() => {
      currentSpec = null
    })
  })
}
