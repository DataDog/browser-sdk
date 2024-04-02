import type { Configuration } from '@datadog/browser-core'
import { Observable } from '@datadog/browser-core'
import { mockCiVisibilityValues } from '../../../test'
import type { CookieObservable } from '../../browser/cookieObservable'
import type { CiVisibilityContext } from './ciVisibilityContext'
import { startCiVisibilityContext } from './ciVisibilityContext'

describe('startCiVisibilityContext', () => {
  let ciVisibilityContext: CiVisibilityContext
  let cookieObservable: CookieObservable
  beforeEach(() => {
    cookieObservable = new Observable()
  })

  afterEach(() => {
    ciVisibilityContext.stop()
  })

  it('sets the ci visibility context defined by Cypress global variables', () => {
    mockCiVisibilityValues('trace_id_value')
    ciVisibilityContext = startCiVisibilityContext({} as Configuration, cookieObservable)

    expect(ciVisibilityContext.get()).toEqual({
      test_execution_id: 'trace_id_value',
    })
  })

  it('sets the ci visibility context defined by global cookie', () => {
    mockCiVisibilityValues('trace_id_value', 'cookies')
    ciVisibilityContext = startCiVisibilityContext({} as Configuration, cookieObservable)

    expect(ciVisibilityContext.get()).toEqual({
      test_execution_id: 'trace_id_value',
    })
  })

  it('update the ci visibility context when global cookie is updated', () => {
    mockCiVisibilityValues('trace_id_value', 'cookies')
    ciVisibilityContext = startCiVisibilityContext({} as Configuration, cookieObservable)
    cookieObservable.notify('trace_id_value_updated')

    expect(ciVisibilityContext.get()).toEqual({
      test_execution_id: 'trace_id_value_updated',
    })
  })

  it('does not set ci visibility context if the Cypress global variable is undefined', () => {
    mockCiVisibilityValues(undefined)
    ciVisibilityContext = startCiVisibilityContext({} as Configuration, cookieObservable)

    expect(ciVisibilityContext.get()).toBeUndefined()
  })

  it('does not set ci visibility context if it is not a string', () => {
    mockCiVisibilityValues({ key: 'value' })
    ciVisibilityContext = startCiVisibilityContext({} as Configuration, cookieObservable)

    expect(ciVisibilityContext.get()).toBeUndefined()
  })
})
