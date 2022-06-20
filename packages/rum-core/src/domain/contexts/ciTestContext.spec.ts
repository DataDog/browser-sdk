import { mockCiVisibilityWindowValues, cleanupCiVisibilityWindowValues } from '../../../test/specHelper'
import { getCiTestContext } from './ciTestContext'

describe('getCiTestContext', () => {
  afterEach(() => {
    cleanupCiVisibilityWindowValues()
  })

  it('sets the ci visibility context defined by Cypress global variables', () => {
    mockCiVisibilityWindowValues('trace_id_value')

    expect(getCiTestContext()).toEqual({
      test_execution_id: 'trace_id_value',
    })
  })

  it('does not set ci visibility context if the Cypress global variable is undefined', () => {
    mockCiVisibilityWindowValues()

    expect(getCiTestContext()).toBeUndefined()
  })

  it('does not set ci visibility context if Cypress global variables are not strings', () => {
    mockCiVisibilityWindowValues({ key: 'value' })

    expect(getCiTestContext()).toBeUndefined()
  })
})
