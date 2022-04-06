import { ErrorSource, resetExperimentalFeatures, updateExperimentalFeatures, display } from '@datadog/browser-core'
import { validateAndBuildLogsConfiguration } from '../../configuration'
import { HandlerType, StatusType } from '../../logger'
import { createSender } from '../../sender'
import { startConsoleCollection } from './consoleCollection'

describe('error collection', () => {
  const initConfiguration = { clientToken: 'xxx', service: 'service' }
  let sendLogSpy: jasmine.Spy
  let consoleLogSpy: jasmine.Spy

  beforeEach(() => {
    sendLogSpy = jasmine.createSpy('sendLogSpy')
    consoleLogSpy = spyOn(console, 'log').and.callFake(() => true)
    spyOn(console, 'error').and.callFake(() => true)
  })

  it('should send console logs when ff forward-logs is enabled', () => {
    updateExperimentalFeatures(['forward-logs'])
    const { stop } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      createSender(sendLogSpy)
    )

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(sendLogSpy).toHaveBeenCalledWith({
      message: 'console log: foo bar',
      status: StatusType.info,
    })

    expect(consoleLogSpy).toHaveBeenCalled()

    resetExperimentalFeatures()
    stop()
  })

  it('should not send console logs when ff forward-logs is disabled', () => {
    const { stop } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      createSender(sendLogSpy)
    )

    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(sendLogSpy).not.toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalled()

    stop()
  })

  it('console error should have an error object defined', () => {
    const { stop } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardErrorsToLogs: true })!,
      createSender(sendLogSpy)
    )

    /* eslint-disable-next-line no-console */
    console.error('foo', 'bar')

    expect(sendLogSpy.calls.mostRecent().args[0].error).toEqual({
      origin: ErrorSource.CONSOLE,
      stack: undefined,
    })

    stop()
  })

  it('should not print the log twice when console handler is enabled', () => {
    updateExperimentalFeatures(['forward-logs'])

    const sender = createSender(sendLogSpy)
    const displaySpy = spyOn(display, 'log')
    const { stop } = startConsoleCollection(
      validateAndBuildLogsConfiguration({ ...initConfiguration, forwardConsoleLogs: ['log'] })!,
      sender
    )

    sender.setHandler([HandlerType.console])
    /* eslint-disable-next-line no-console */
    console.log('foo', 'bar')

    expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    expect(displaySpy).not.toHaveBeenCalled()

    resetExperimentalFeatures()
    stop()
  })
})
