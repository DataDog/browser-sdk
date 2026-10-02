import { beforeEach, afterEach } from 'vitest'

export interface TestSpec {
  fullName: string
}

let currentSpec: TestSpec | null = null

export function getCurrentJasmineSpec(): TestSpec | null {
  return currentSpec
}

beforeEach((context) => {
  currentSpec = { fullName: context.task.name }
})

afterEach(() => {
  currentSpec = null
})
