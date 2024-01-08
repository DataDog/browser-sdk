import type { Context, ContextManager } from '@datadog/browser-core'
import { CustomerDataType, createContextManager, createCustomerDataTracker, noop } from '@datadog/browser-core'
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
    const globalContextManager: ContextManager = createContextManager(
      createCustomerDataTracker(CustomerDataType.GlobalContext, noop)
    )
    const userContextManager: ContextManager = createContextManager(
      createCustomerDataTracker(CustomerDataType.User, noop)
    )
    spyOn(globalContextManager, 'getContext').and.callFake(() => fakeContext)
    spyOn(userContextManager, 'getContext').and.callFake(() => fakeContext)

    const recorderApi: RecorderApi = { ...noopRecorderApi, isRecording: () => isRecording }
    buildCommonContext = (): CommonContext =>
      buildCommonContextImpl(globalContextManager, userContextManager, recorderApi)
  })

  it('should return common context', () => {
    expect(buildCommonContext()).toEqual({
      context: fakeContext,
      user: fakeContext,
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
