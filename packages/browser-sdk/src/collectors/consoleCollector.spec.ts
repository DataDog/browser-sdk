import { Pipeline } from '@datadog/core-next'
import type { ConsoleResource } from '@datadog/core-next'
import { startConsoleCollection } from './consoleCollector'

describe('startConsoleCollection', () => {
  let originalConsoleMethods: Record<string, Function>
  let pipeline: Pipeline<Record<string, unknown>>
  let stop: () => void
  let collected: ConsoleResource[]

  beforeEach(() => {
    originalConsoleMethods = {
      log: console.log,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
    }

    pipeline = new Pipeline<Record<string, unknown>>()
    collected = []
    pipeline.subscribe('resource:console', (event) => {
      collected.push(event as ConsoleResource)
    })
    pipeline.seal()

    stop = startConsoleCollection(pipeline)
  })

  afterEach(() => {
    stop()
    console.log = originalConsoleMethods.log as typeof console.log
    console.debug = originalConsoleMethods.debug as typeof console.debug
    console.info = originalConsoleMethods.info as typeof console.info
    console.warn = originalConsoleMethods.warn as typeof console.warn
    console.error = originalConsoleMethods.error as typeof console.error
  })

  it('publishes resource:console when console.error is called', async () => {
    console.error('something went wrong')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected.length).toBe(1)
  })

  it('publishes resource:console when console.warn is called', async () => {
    console.warn('a warning')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected.length).toBe(1)
  })

  it('publishes resource:console when console.log is called', async () => {
    console.log('hello world')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected.length).toBe(1)
  })

  it('includes the message in the resource', async () => {
    console.log('hello world')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected[0].message).toBe('hello world')
  })

  it('includes the api field matching the console method name', async () => {
    console.warn('test warning')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected[0].api).toBe('warn')
  })

  it('includes error object when an Error is passed to console.error', async () => {
    const err = new Error('boom')
    console.error(err)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected[0].error).toBe(err)
  })

  it('includes raw error object for stack trace enrichment', async () => {
    const err = new Error('with stack')
    console.error(err)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected[0].error).toBe(err)
  })

  it('stop() restores original console methods', () => {
    stop()
    expect(console.log).toBe(originalConsoleMethods.log)
    expect(console.warn).toBe(originalConsoleMethods.warn)
    expect(console.error).toBe(originalConsoleMethods.error)
    expect(console.debug).toBe(originalConsoleMethods.debug)
    expect(console.info).toBe(originalConsoleMethods.info)
  })

  it('does not publish after stop() is called', async () => {
    stop()
    console.log('after stop')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(collected.length).toBe(0)
  })
})
