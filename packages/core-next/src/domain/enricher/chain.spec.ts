import { chain } from './chain'
import { enricher, SKIP, DISCARD } from './factory'

describe('chain', () => {
  it('should pass data through enrichers in dependency order', async () => {
    interface Data {
      type: string
    }

    const session = enricher({
      name: 'session',
      transform: (data: Data) => ({ ...data, sessionId: 'sess-1' }),
    })
    const view = enricher({
      name: 'view',
      requires: [session],
      transform: (data) => ({ ...data, viewId: `view-${data.sessionId}` }),
    })

    const run = chain([view, session])
    const result = await run({ type: 'error' })

    expect(result).toEqual({ type: 'error', sessionId: 'sess-1', viewId: 'view-sess-1' })
  })

  it('should return null when an enricher discards', async () => {
    const consent = enricher({
      name: 'consent',
      transform: (_data: { type: string }) => DISCARD,
    })
    const session = enricher({
      name: 'session',
      transform: (data: { type: string }) => ({ ...data, sessionId: 'x' }),
    })

    const run = chain([consent, session])
    const result = await run({ type: 'error' })

    expect(result).toBeNull()
  })

  it('should return data unchanged when no enrichers', async () => {
    const run = chain<string, []>([])
    const result = await run('hello')

    expect(result).toBe('hello')
  })

  it('should handle async enrichers', async () => {
    const double = enricher({
      name: 'double',
      transform: async (n: number) => {
        await new Promise((r) => setTimeout(r, 5))
        return n * 2
      },
    })
    const addOne = enricher({
      name: 'addOne',
      requires: [double],
      transform: (n) => n + 1,
    })

    const run = chain([addOne, double])
    const result = await run(5)

    expect(result).toBe(11)
  })

  it('should pass data through unchanged when enricher skips', async () => {
    interface Data {
      type: string
    }

    const session = enricher({
      name: 'session',
      transform: (_data: Data) => SKIP,
    })

    const run = chain([session])
    const result = await run({ type: 'error' })

    expect(result).toEqual({ type: 'error' })
  })

  it('should pass data through unchanged when enricher skips but independent enrichers still run', async () => {
    interface Data {
      type: string
    }

    const session = enricher({
      name: 'session',
      transform: (_data: Data) => SKIP,
    })
    const profiling = enricher({
      name: 'profiling',
      transform: (data: Data) => ({ ...data, profilingId: 'prof-1' }),
    })

    const run = chain([session, profiling])
    const result = await run({ type: 'error' })

    expect(result).toEqual({ type: 'error', profilingId: 'prof-1' })
  })

  it('should skip dependent enrichers when a required enricher skips', async () => {
    interface Data {
      type: string
    }
    const viewTransform = jasmine.createSpy('viewTransform')

    const session = enricher({
      name: 'session',
      transform: (_data: Data) => SKIP,
    })
    const view = enricher({
      name: 'view',
      requires: [session],
      transform: viewTransform,
    })

    const run = chain([session, view])
    await run({ type: 'error' })

    expect(viewTransform).not.toHaveBeenCalled()
  })

  it('should not skip independent enrichers when an unrelated enricher skips', async () => {
    interface Data {
      type: string
    }

    const session = enricher({
      name: 'session',
      transform: (_data: Data) => SKIP,
    })
    const profiling = enricher({
      name: 'profiling',
      transform: (data: Data) => ({ ...data, profilingData: 'perf' }),
    })

    const run = chain([session, profiling])
    const result = await run({ type: 'error' })

    expect(result).toEqual({ type: 'error', profilingData: 'perf' })
  })

  it('should propagate skip transitively through the dependency chain', async () => {
    interface Data {
      type: string
    }
    const actionTransform = jasmine.createSpy('actionTransform')

    const session = enricher({
      name: 'session',
      transform: (_data: Data) => SKIP,
    })
    const view = enricher({
      name: 'view',
      requires: [session],
      transform: (_data: any) => SKIP,
    })
    const action = enricher({
      name: 'action',
      requires: [view],
      transform: actionTransform,
    })

    const run = chain([session, view, action])
    await run({ type: 'error' })

    expect(actionTransform).not.toHaveBeenCalled()
  })

  it('should propagate enricher errors', async () => {
    const broken = enricher({
      name: 'broken',
      transform: (_data: string): string => {
        throw new Error('boom')
      },
    })

    const run = chain([broken])
    await expectAsync(run('x')).toBeRejectedWithError('boom')
  })
})
