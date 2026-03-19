import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogErrorHandler } from './provideDatadogErrorHandler'

describe('provideDatadogErrorHandler', () => {
  it('provides an ErrorHandler that reports errors to Datadog', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({ addError: addErrorSpy })

    const provider = provideDatadogErrorHandler()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const handler = new (provider as any).useClass() as { handleError: (error: unknown) => void }

    const error = new Error('test error')
    handler.handleError(error)

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error,
        handlingStack: jasmine.any(String),
        startClocks: jasmine.any(Object),
        context: jasmine.objectContaining({
          framework: 'angular',
        }),
      })
    )
  })

  it('still logs the error to the console via default ErrorHandler', () => {
    initializeAngularPlugin()

    const provider = provideDatadogErrorHandler()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const handler = new (provider as any).useClass() as { handleError: (error: unknown) => void }

    const consoleErrorSpy = spyOn(console, 'error')
    const error = new Error('test error')
    handler.handleError(error)

    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
