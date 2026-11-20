import { beforeEach, onTestFinished } from 'vitest'

let currentTest: { fullName: string } | null = null

export function getCurrentTest() {
  return currentTest
}

/**
 * Called from forEach.ts, a setup file which runs for every test file. Hooks registered when this module is
 * evaluated would only apply to the first test file when files share the same page (`isolate:
 * false`).
 */
export function trackCurrentTest() {
  beforeEach((context) => {
    const parts: string[] = []
    let current: any = context.task
    while (current) {
      if (current.name) {
        parts.unshift(current.name)
      }
      current = current.suite
    }
    currentTest = { fullName: parts.join(' ') }

    onTestFinished(() => {
      currentTest = null
    })
  })
}
