import { beforeEach, onTestFinished } from 'vitest'

export interface CurrentTest {
  id: string
  name: string
  meta: Record<string, unknown>
}

let currentTest: CurrentTest | null = null

export function getCurrentTest(): CurrentTest | null {
  return currentTest
}

beforeEach((context) => {
  currentTest = {
    id: context.task.id,
    name: context.task.name,
    meta: context.task.meta as Record<string, unknown>,
  }
  onTestFinished(() => {
    currentTest = null
  })
})

export function allowCurrentTestConsoleLogs(): void {
  if (!currentTest) {
    throw new Error('allowCurrentTestConsoleLogs() must be called from a test')
  }
  currentTest.meta.allowUnexpectedConsoleLogs = true
}
