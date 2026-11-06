import type { EnvironmentInjector, EnvironmentProviders } from '@angular/core'
import { ErrorHandler, Injector, createEnvironmentInjector } from '@angular/core'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogErrorHandler, provideNoopDatadogErrorHandler } from './provideDatadogErrorHandler'

function createErrorHandler(providers: EnvironmentProviders[] = []): ErrorHandler {
  const injector = createEnvironmentInjector(
    [provideDatadogErrorHandler(), providers],
    Injector.NULL as EnvironmentInjector
  )
  return injector.get(ErrorHandler)
}

describe('provideDatadogErrorHandler', () => {
  it('provides an ErrorHandler that reports errors to Datadog', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({ addError: addErrorSpy })

    spyOn(console, 'error') // Mute console.errors
    const handler = createErrorHandler()
    handler.handleError(new Error('test error'))

    expect(addErrorSpy).toHaveBeenCalled()
  })

  it('still logs the error to the console via default ErrorHandler', () => {
    initializeAngularPlugin()

    const consoleErrorSpy = spyOn(console, 'error')
    const handler = createErrorHandler()
    handler.handleError(new Error('test error'))

    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('does not report errors with provideNoopDatadogErrorHandler(), but still logs them to the console', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({ addError: addErrorSpy })

    const consoleErrorSpy = spyOn(console, 'error')
    const handler = createErrorHandler([provideNoopDatadogErrorHandler()])
    handler.handleError(new Error('test error'))

    expect(addErrorSpy).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })
})
