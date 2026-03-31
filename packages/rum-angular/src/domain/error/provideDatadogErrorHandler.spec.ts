import type { EnvironmentInjector } from '@angular/core'
import { ErrorHandler, Injector, createEnvironmentInjector } from '@angular/core'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { provideDatadogErrorHandler } from './provideDatadogErrorHandler'

function createErrorHandler(): ErrorHandler {
  const injector = createEnvironmentInjector([provideDatadogErrorHandler()], Injector.NULL as EnvironmentInjector)
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
})
