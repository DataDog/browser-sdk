import { ContextManager } from '../context/context'
import { contextEnricher } from './contextEnricher'

describe('contextEnricher', () => {
  let globalContext: ContextManager
  let userContext: ContextManager
  let accountContext: ContextManager

  beforeEach(() => {
    globalContext = new ContextManager()
    userContext = new ContextManager()
    accountContext = new ContextManager()
  })

  it('merges global context into event data', () => {
    globalContext.set({ env: 'production', version: '1.0.0' })
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ message: 'hello' })

    expect((result as any).env).toBe('production')
    expect((result as any).version).toBe('1.0.0')
    expect((result as any).message).toBe('hello')
  })

  it('merges user context into event data under usr key', () => {
    userContext.set({ id: 'user-42', name: 'Alice' })
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ message: 'hello' })

    expect((result as any).usr).toEqual({ id: 'user-42', name: 'Alice' })
  })

  it('includes account context under account key when non-empty', () => {
    accountContext.set({ id: 'acct-1', name: 'Acme' })
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ message: 'hello' })

    expect((result as any).account).toEqual({ id: 'acct-1', name: 'Acme' })
  })

  it('skips account key when account context is empty', () => {
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ message: 'hello' })

    expect((result as any).account).toBeUndefined()
  })

  it('preserves existing event data', () => {
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ status: 'info', origin: 'logger' })

    expect((result as any).status).toBe('info')
    expect((result as any).origin).toBe('logger')
  })

  it('global context properties override existing event fields', () => {
    globalContext.set({ status: 'overridden' })
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({ status: 'original' })

    expect((result as any).status).toBe('overridden')
  })

  it('has name "context"', () => {
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    expect(enricherInstance.name).toBe('context')
  })

  it('returns empty usr when user context is empty', () => {
    const enricherInstance = contextEnricher(globalContext, userContext, accountContext)
    const result = enricherInstance.transform({})

    expect((result as any).usr).toEqual({})
  })
})
