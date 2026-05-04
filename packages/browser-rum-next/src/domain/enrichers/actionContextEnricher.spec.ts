import { actionContextEnricher } from './actionContextEnricher'

describe('actionContextEnricher', () => {
  it('stamps action.id on error events when action is active', () => {
    const contexts = { getCurrentActionIds: () => ['action-123'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'error', error: { message: 'test' } })
    expect((result as any).action).toEqual({ id: ['action-123'] })
  })

  it('stamps action.id on resource events when action is active', () => {
    const contexts = { getCurrentActionIds: () => ['action-456'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'resource', resource: {} })
    expect((result as any).action).toEqual({ id: ['action-456'] })
  })

  it('stamps action.id on long_task events when action is active', () => {
    const contexts = { getCurrentActionIds: () => ['action-789'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'long_task' })
    expect((result as any).action).toEqual({ id: ['action-789'] })
  })

  it('does not stamp action.id when no action is active', () => {
    const contexts = { getCurrentActionIds: () => [] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'error', error: {} })
    expect((result as any).action).toBeUndefined()
  })

  it('does not stamp action.id on view events', () => {
    const contexts = { getCurrentActionIds: () => ['action-123'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'view' })
    expect((result as any).action).toBeUndefined()
  })

  it('does not stamp action.id on action events', () => {
    const contexts = { getCurrentActionIds: () => ['action-123'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'action', action: { id: 'own-id' } })
    expect((result as any).action).toEqual({ id: 'own-id' })
  })

  it('returns multiple action IDs when both click and manual are active', () => {
    const contexts = { getCurrentActionIds: () => ['click-1', 'manual-1'] }
    const enricher = actionContextEnricher(contexts)
    const result = enricher.transform({ type: 'error', error: {} })
    expect((result as any).action).toEqual({ id: ['click-1', 'manual-1'] })
  })

  it('has name "actionContext"', () => {
    const contexts = { getCurrentActionIds: () => [] }
    const enricher = actionContextEnricher(contexts)
    expect(enricher.name).toBe('actionContext')
  })
})
