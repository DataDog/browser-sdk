import { beforeEach, afterEach } from 'vitest'
import type { Task } from 'vitest'

interface SpecResult {
  fullName: string
}

let currentSpec: SpecResult | null = null

export function getCurrentJasmineSpec() {
  return currentSpec
}

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
