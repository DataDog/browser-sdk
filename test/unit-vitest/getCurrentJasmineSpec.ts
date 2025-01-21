import { beforeEach, afterEach } from 'vitest'

let currentSpec: { fullName: string } | null = null

export function getCurrentJasmineSpec() {
  return currentSpec
}

beforeEach((context) => {
  const parts: string[] = []
  let current: any = context.task
  while (current) {
    if (current.name) parts.unshift(current.name)
    current = current.suite
  }
  currentSpec = { fullName: parts.join(' ') }
})

afterEach(() => {
  currentSpec = null
})
