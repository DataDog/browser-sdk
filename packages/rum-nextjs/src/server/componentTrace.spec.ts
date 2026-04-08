import {
  withComponentTrace,
  getComponentTraceContext,
  setComponentTraceStoreForTesting,
} from './componentTrace'
import * as edgeRuntimeModule from './edgeRuntime'

describe('componentTrace', () => {
  // Provide a simple synchronous store mock since AsyncLocalStorage is not available
  // in the browser test environment. This mock implements a basic context stack.
  let contextStack: Array<{ componentName: string }>

  beforeEach(() => {
    contextStack = []

    setComponentTraceStoreForTesting({
      run<T>(context: { componentName: string }, fn: () => T): T {
        contextStack.push(context)
        try {
          return fn()
        } finally {
          contextStack.pop()
        }
      },
      getStore() {
        return contextStack.length > 0 ? contextStack[contextStack.length - 1] : undefined
      },
    })

    // Default to edge runtime to avoid dd-trace dynamic import in tests
    spyOn(edgeRuntimeModule, 'isEdgeRuntime').and.returnValue(true)
    spyOn(edgeRuntimeModule, 'createEdgeTracer').and.returnValue({
      startSpan: () => ({
        setTag: () => undefined,
        finish: () => undefined,
        context: () => ({ toTraceId: () => 'trace-id', toSpanId: () => 'span-id' }),
      }),
    })
  })

  afterEach(() => {
    setComponentTraceStoreForTesting(undefined)
  })

  describe('withComponentTrace', () => {
    it('should call the wrapped component with props', async () => {
      const component = jasmine.createSpy('component').and.resolveTo(null)
      const traced = withComponentTrace('TestComponent', component)

      await traced({ id: 42 })

      expect(component).toHaveBeenCalledWith({ id: 42 })
    })

    it('should set context with the component name', async () => {
      let capturedContext: ReturnType<typeof getComponentTraceContext> | undefined

      const component = async () => {
        capturedContext = getComponentTraceContext()
        return null
      }
      const traced = withComponentTrace('MyComponent', component)

      await traced({})

      expect(capturedContext).toEqual({ componentName: 'MyComponent' })
    })

    it('should support nested component traces', async () => {
      let outerContext: ReturnType<typeof getComponentTraceContext> | undefined
      let innerContext: ReturnType<typeof getComponentTraceContext> | undefined

      const innerComponent = async () => {
        innerContext = getComponentTraceContext()
        return null
      }
      const tracedInner = withComponentTrace('Inner', innerComponent)

      const outerComponent = async () => {
        outerContext = getComponentTraceContext()
        await tracedInner({})
        return null
      }
      const tracedOuter = withComponentTrace('Outer', outerComponent)

      await tracedOuter({})

      expect(outerContext).toEqual({ componentName: 'Outer' })
      expect(innerContext).toEqual({ componentName: 'Inner' })
    })

    it('should return the component result', async () => {
      const component = async () => 'rendered' as any
      const traced = withComponentTrace('TestComponent', component)

      const result = await traced({})

      expect(result).toBe('rendered')
    })

    it('should propagate errors from the component', async () => {
      const error = new Error('render failed')
      const component = async () => {
        throw error
      }
      const traced = withComponentTrace('FailingComponent', component)

      await expectAsync(traced({})).toBeRejectedWith(error)
    })
  })

  describe('edge runtime tracing', () => {
    let mockSpan: { setTag: jasmine.Spy; finish: jasmine.Spy; context: jasmine.Spy }

    beforeEach(() => {
      mockSpan = {
        setTag: jasmine.createSpy('setTag'),
        finish: jasmine.createSpy('finish'),
        context: jasmine.createSpy('context').and.returnValue({
          toTraceId: () => 'trace-id',
          toSpanId: () => 'span-id',
        }),
      }
      ;(edgeRuntimeModule.createEdgeTracer as jasmine.Spy).and.returnValue({
        startSpan: () => mockSpan,
      })
    })

    it('should create an edge tracer span and finish it', async () => {
      const component = async () => null
      const traced = withComponentTrace('EdgeComponent', component)

      await traced({})

      expect(edgeRuntimeModule.createEdgeTracer).toHaveBeenCalled()
      expect(mockSpan.finish).toHaveBeenCalled()
    })

    it('should finish the span and set error tag when the component throws', async () => {
      const error = new Error('edge error')
      const component = async () => {
        throw error
      }
      const traced = withComponentTrace('FailingEdge', component)

      await expectAsync(traced({})).toBeRejectedWith(error)

      expect(mockSpan.setTag).toHaveBeenCalledWith('error', error)
      expect(mockSpan.finish).toHaveBeenCalled()
    })
  })

  describe('getComponentTraceContext', () => {
    it('should return undefined outside of a withComponentTrace wrapper', () => {
      expect(getComponentTraceContext()).toBeUndefined()
    })
  })
})
