import { ErrorSource } from '@datadog/browser-core'
import { FAKE_CSP_VIOLATION_EVENT, FAKE_REPORT, mockSourceCodeContext } from '@datadog/browser-core/test'
import type { RelativeTime, TimeStamp } from '@datadog/js-core/time'
import type { AssembleHook, AssembleHookParams } from '../hooks'
import { createHooks } from '../hooks'
import { StatusType } from '../logger/isAuthorized'
import { startSourceCodeMfeContext } from './sourceCodeMfeContext'

describe('logs source code MFE context', () => {
  const bundleStack = 'Error\n    at bootstrap (https://example.com/checkout.js:1:1)'
  const errorStack = 'Error: failure\n    at checkout (https://example.com/checkout.js:42:10)'
  const handlingStack = 'Error\n    at report (https://example.com/shell.js:10:5)'

  let assembleHook: AssembleHook

  beforeEach(() => {
    assembleHook = createHooks().assembleEventDefaults
    startSourceCodeMfeContext(assembleHook)
  })

  function getContext(
    rawLogsEvent: AssembleHookParams['rawLogsEvent'],
    domainContext?: AssembleHookParams['domainContext']
  ) {
    return assembleHook.trigger({ startTime: 0 as RelativeTime, rawLogsEvent, domainContext })
  }

  const message = { date: 0 as TimeStamp, message: 'message', status: StatusType.error }

  it('does not attribute logs when source code context is not available', () => {
    expect(getContext({ ...message, origin: ErrorSource.LOGGER }, { handlingStack: errorStack })).toBeUndefined()
  })

  ;[
    FAKE_REPORT,
    { ...FAKE_REPORT, type: 'deprecation' as const, body: { ...FAKE_REPORT.body, anticipatedRemoval: null } },
  ].forEach((report) => {
    it(`attributes ${report.type} reports using their source file without an error stack`, () => {
      mockSourceCodeContext({
        'Error\n    at report (http://foo.bar/index.js:20:10)': { service: 'checkout', version: '1.2.3' },
      })

      expect(getContext({ ...message, origin: ErrorSource.REPORT }, { report })).toEqual({
        service: 'checkout',
        version: '1.2.3',
      })
    })
  })

  it('attributes CSP violations using the report error stack', () => {
    const stack = `worker-src: 'blob' blocked by 'worker-src' directive of the policy "worker-src 'none'"
  at <anonymous> @ http://foo.bar/index.js:17:8`
    mockSourceCodeContext({ [stack]: { service: 'checkout', version: '1.2.3' } })

    expect(
      getContext(
        { ...message, origin: ErrorSource.REPORT, error: { stack, handling: undefined } },
        { report: FAKE_CSP_VIOLATION_EVENT }
      )
    ).toEqual({ service: 'checkout', version: '1.2.3' })
  })

  it('does not use the document URL for reports without a source file', () => {
    mockSourceCodeContext({
      'Error\n    at document (http://foo.bar:1:1)': { service: 'shell', version: '1.0.0' },
    })

    expect(
      getContext(
        { ...message, origin: ErrorSource.REPORT },
        { report: { ...FAKE_REPORT, body: { ...FAKE_REPORT.body, sourceFile: null } } }
      )
    ).toBeUndefined()
  })

  it('uses the report source file instead of the error stack', () => {
    mockSourceCodeContext({
      [bundleStack]: { service: 'checkout', version: '1.2.3' },
      [handlingStack]: { service: 'shell', version: '4.5.6' },
    })

    expect(
      getContext(
        { ...message, origin: ErrorSource.REPORT, error: { stack: handlingStack, handling: undefined } },
        { report: { ...FAKE_REPORT, body: { ...FAKE_REPORT.body, sourceFile: 'https://example.com/checkout.js' } } }
      )
    ).toEqual({ service: 'checkout', version: '1.2.3' })
  })

  it('attributes runtime errors without a domain context using the error stack', () => {
    mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

    expect(
      getContext({ ...message, origin: ErrorSource.SOURCE, error: { stack: errorStack, handling: undefined } })
    ).toEqual({ service: 'checkout', version: '1.2.3' })
  })

  ;[ErrorSource.LOGGER, ErrorSource.CONSOLE, ErrorSource.SOURCE, ErrorSource.REPORT].forEach((origin) => {
    it(`attributes ${origin} errors using the error stack`, () => {
      mockSourceCodeContext({
        [bundleStack]: { service: 'checkout', version: '1.2.3', ddDebugId: 'debug-id' },
        [handlingStack]: { service: 'shell', version: '4.5.6' },
      })

      expect(
        getContext({ ...message, origin, error: { stack: errorStack, handling: undefined } }, { handlingStack })
      ).toEqual({ service: 'checkout', version: '1.2.3' })
    })
  })

  ;[ErrorSource.LOGGER, ErrorSource.CONSOLE].forEach((origin) => {
    it(`attributes ${origin} messages using the handling stack`, () => {
      mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

      expect(getContext({ ...message, origin }, { handlingStack: errorStack })).toEqual({
        service: 'checkout',
        version: '1.2.3',
      })
    })
  })

  it('falls back to the handling stack when the error stack is empty', () => {
    mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

    expect(
      getContext(
        { ...message, origin: ErrorSource.LOGGER, error: { stack: '', handling: undefined } },
        { handlingStack: errorStack }
      )
    ).toEqual({ service: 'checkout', version: '1.2.3' })
  })

  it('attributes network errors to the request call site, ignoring response text in error.stack', () => {
    mockSourceCodeContext({
      [bundleStack]: { service: 'checkout', version: '1.2.3' },
      [handlingStack]: { service: 'shell' },
    })

    expect(
      getContext(
        {
          ...message,
          origin: ErrorSource.NETWORK,
          http: { method: 'GET', status_code: 500, url: 'https://example.com/api' },
          error: { stack: handlingStack, handling: undefined },
        },
        { handlingStack: errorStack }
      )
    ).toEqual({ service: 'checkout', version: '1.2.3' })
  })

  it('does not attribute network errors from response text when the handling stack is missing', () => {
    mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

    expect(
      getContext(
        {
          ...message,
          origin: ErrorSource.NETWORK,
          http: { method: 'GET', status_code: 500, url: 'https://example.com/api' },
          error: { stack: errorStack, handling: undefined },
        },
        {}
      )
    ).toBeUndefined()
  })

  it('does not attribute errors to a deeper frame or to the reporting bundle when the top frame is unknown', () => {
    mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

    expect(
      getContext(
        {
          ...message,
          origin: ErrorSource.LOGGER,
          error: {
            stack: `${handlingStack}\n    at checkout (https://example.com/checkout.js:42:10)`,
            handling: undefined,
          },
        },
        { handlingStack: errorStack }
      )
    ).toBeUndefined()
  })

  ;[undefined, 'not a stack', handlingStack].forEach((stack) => {
    it(`does not attribute logs with an absent, invalid or unknown stack (${stack})`, () => {
      mockSourceCodeContext({ [bundleStack]: { service: 'checkout', version: '1.2.3' } })

      expect(
        getContext({ ...message, origin: ErrorSource.LOGGER }, stack ? { handlingStack: stack } : undefined)
      ).toBeUndefined()
    })
  })

  it('picks up bundles loaded after initialization', () => {
    const context = mockSourceCodeContext()
    expect(getContext({ ...message, origin: ErrorSource.LOGGER }, { handlingStack: errorStack })).toBeUndefined()

    context.addEntry(bundleStack, { service: 'checkout', version: '1.2.3' })

    expect(getContext({ ...message, origin: ErrorSource.LOGGER }, { handlingStack: errorStack })).toEqual({
      service: 'checkout',
      version: '1.2.3',
    })
  })
})
