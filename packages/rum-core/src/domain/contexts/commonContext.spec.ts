import type { Context, ContextManager } from '@datadog/browser-core'
import { createContextManagerStub } from '../../../../core/test/specHelper'
import { noopRecorderApi } from '../../../test/specHelper'
import type { RecorderApi } from '../../boot/rumPublicApi'
import type { CommonContext } from './commonContext'
import { getCommonContext as getCommonContextImpl } from './commonContext'

describe('commonContext', () => {
  let isRecording: boolean
  let fakeContext: Context
  let getCommonContext: () => CommonContext

  beforeEach(() => {
    isRecording = false
    fakeContext = { foo: 'bar' }
    const globalContextManager: ContextManager = createContextManagerStub(fakeContext)
    const userContextManager: ContextManager = createContextManagerStub(fakeContext)
    const recorderApi: RecorderApi = { ...noopRecorderApi, isRecording: () => isRecording }
    getCommonContext = (): CommonContext => getCommonContextImpl(globalContextManager, userContextManager, recorderApi)
  })

  it('should return common context', () => {
    expect(getCommonContext()).toEqual({
      context: fakeContext,
      user: fakeContext,
      hasReplay: undefined,
    })
  })

  describe('hasReplay', () => {
    it('should be undefined if it is not recording', () => {
      isRecording = false
      expect(getCommonContext().hasReplay).toBeUndefined()
    })

    it('should be true if it is recording', () => {
      isRecording = true
      expect(getCommonContext().hasReplay).toBeTrue()
    })
  })
})
