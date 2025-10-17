import { beforeEach, afterEach } from 'vitest'
import type { Task } from 'vitest'

interface SpecResult {
  fullName: string
}

let currentSpec: SpecResult | null = null

export function getCurrentSpec() {
  return currentSpec
}

// Keep legacy name for backward compatibility
export const getCurrentJasmineSpec = getCurrentSpec

beforeEach((context) => {
  // Access current test from the context
  const currentTest = (context as any).task as Task | undefined
  if (currentTest) {
    currentSpec = {
      fullName: currentTest.name,
    }
  }
})

afterEach(() => {
  currentSpec = null
})
