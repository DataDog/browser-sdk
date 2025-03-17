import type { Context, ContextManager } from '@flashcatcloud/browser-core'
import { createContextManager, createCustomerDataTracker, noop } from '@flashcatcloud/browser-core'
import type { RecorderApi } from '../../boot/rumPublicApi'
import { noopRecorderApi } from '../../../test'
import type { CommonContext } from './commonContext'
import { buildCommonContext as buildCommonContextImpl } from './commonContext'

describe('commonContext', () => {
  let isRecording: boolean
  let fakeContext: Context
  let buildCommonContext: () => CommonContext

  beforeEach(() => {
    isRecording = false
    fakeContext = { foo: 'bar' }
    const globalContextManager: ContextManager = createContextManager('test', {
      customerDataTracker: createCustomerDataTracker(noop),
    })
    const userContextManager: ContextManager = createContextManager('test', {
      customerDataTracker: createCustomerDataTracker(noop),
    })
    const accountContextManager: ContextManager = createContextManager('test', {
      customerDataTracker: createCustomerDataTracker(noop),
    })
    spyOn(globalContextManager, 'getContext').and.callFake(() => fakeContext)
    spyOn(userContextManager, 'getContext').and.callFake(() => fakeContext)
    spyOn(accountContextManager, 'getContext').and.callFake(() => fakeContext)

    const recorderApi: RecorderApi = { ...noopRecorderApi, isRecording: () => isRecording }
    buildCommonContext = (): CommonContext =>
      buildCommonContextImpl(globalContextManager, userContextManager, accountContextManager, recorderApi)
  })

  it('should return common context', () => {
    expect(buildCommonContext()).toEqual({
      context: fakeContext,
      user: fakeContext,
      account: fakeContext,
      hasReplay: undefined,
    })
  })

  describe('hasReplay', () => {
    it('should be undefined if it is not recording', () => {
      isRecording = false
      expect(buildCommonContext().hasReplay).toBeUndefined()
    })

    it('should be true if it is recording', () => {
      isRecording = true
      expect(buildCommonContext().hasReplay).toBeTrue()
    })
  })
})
