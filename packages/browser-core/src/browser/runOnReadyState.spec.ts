import { globalObject } from '@datadog/js-core/util'
import { replaceMockable } from '../../test'
import { asyncRunOnReadyState, runOnReadyState } from './runOnReadyState'

describe('runOnReadyState', () => {
  it('runs immediately without a document', async () => {
    replaceMockable<Document | undefined>(globalObject.document, undefined)
    const callback = jasmine.createSpy()
    const { stop } = runOnReadyState('interactive', callback)

    expect(callback).toHaveBeenCalledTimes(1)
    stop()
    await asyncRunOnReadyState('complete')
  })
})
