import { RumPublicApi, StartRum } from '@datadog/browser-rum-core'
import { makeRumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let rumGlobal: RumPublicApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let startRumSpy: jasmine.Spy<StartRum>

  beforeEach(() => {
    startRecordingSpy = jasmine.createSpy()
    startRumSpy = jasmine.createSpy().and.callFake(() => {
      return ({} as unknown) as ReturnType<StartRum>
    })
    rumGlobal = makeRumRecorderPublicApi(startRumSpy, startRecordingSpy)
  })

  function getCommonContext() {
    return startRumSpy.calls.first().args[1]()
  }

  describe('init', () => {
    it('should start RUM when init is called', () => {
      expect(startRumSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRumSpy).toHaveBeenCalled()
    })

    it('should start recording when init is called', () => {
      expect(startRecordingSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('should set commonContext.hasReplay to true', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(getCommonContext().hasReplay).toBe(true)
    })
  })
})
