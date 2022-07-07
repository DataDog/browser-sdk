import { cleanupSyntheticsWorkerValues, mockSyntheticsWorkerValues } from '../../../../core/test/syntheticsWorkerValues'
import { getSyntheticsContext } from './syntheticsContext'

describe('getSyntheticsContext', () => {
  afterEach(() => {
    cleanupSyntheticsWorkerValues()
  })

  it('sets the synthetics context defined by global variables', () => {
    mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'globals')

    expect(getSyntheticsContext()).toEqual({
      test_id: 'foo',
      result_id: 'bar',
      injected: false,
    })
  })

  it('sets the synthetics context defined by global cookie', () => {
    mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar' }, 'cookies')

    expect(getSyntheticsContext()).toEqual({
      test_id: 'foo',
      result_id: 'bar',
      injected: false,
    })
  })

  it('sets the `injected` field to true if the Synthetics test is configured to automatically inject RUM', () => {
    mockSyntheticsWorkerValues({ publicId: 'foo', resultId: 'bar', injectsRum: true }, 'globals')

    expect(getSyntheticsContext()!.injected).toBeTrue()
  })

  it('does not set synthetics context if one global variable is undefined', () => {
    mockSyntheticsWorkerValues({ publicId: 'foo' }, 'globals')

    expect(getSyntheticsContext()).toBeUndefined()
  })

  it('does not set synthetics context if global variables are not strings', () => {
    mockSyntheticsWorkerValues({ publicId: 1, resultId: 2 }, 'globals')

    expect(getSyntheticsContext()).toBeUndefined()
  })

  it('does not set synthetics context if one cookie is undefined', () => {
    mockSyntheticsWorkerValues({ publicId: 'foo' }, 'cookies')

    expect(getSyntheticsContext()).toBeUndefined()
  })
})
