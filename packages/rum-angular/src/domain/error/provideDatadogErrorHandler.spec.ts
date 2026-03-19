import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogErrorHandler } from './provideDatadogErrorHandler'

describe('provideDatadogErrorHandler', () => {
  it('provides an ErrorHandler that reports errors to Datadog', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({ addError: addErrorSpy })

    const providers = provideDatadogErrorHandler()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const handler = new (providers as any).ɵproviders[0].useClass() as { handleError: (error: unknown) => void }

    const error = new Error('test error')
    handler.handleError(error)

    expect(addErrorSpy).toHaveBeenCalled()
  })

  it('still logs the error to the console via default ErrorHandler', () => {
    initializeAngularPlugin()

    const providers = provideDatadogErrorHandler()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const handler = new (providers as any).ɵproviders[0].useClass() as { handleError: (error: unknown) => void }

    const consoleErrorSpy = spyOn(console, 'error')
    const error = new Error('test error')
    handler.handleError(error)

    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
