/* eslint-disable @typescript-eslint/unbound-method */
import { Configuration } from '@datadog/browser-core'
import { StartRum } from '@datadog/browser-rum-core'
import { makeRumRecorderPublicApi, RumRecorderPublicApi, StartRecording } from './rumRecorderPublicApi'

const DEFAULT_INIT_CONFIGURATION = { applicationId: 'xxx', clientToken: 'xxx' }

describe('makeRumRecorderPublicApi', () => {
  let rumGlobal: RumRecorderPublicApi
  let startRecordingSpy: jasmine.Spy<StartRecording>
  let stopRecordingSpy: jasmine.Spy<() => void>
  let startRumSpy: jasmine.Spy<StartRum>

  beforeEach(() => {
    stopRecordingSpy = jasmine.createSpy()
    startRecordingSpy = jasmine.createSpy().and.callFake(() => ({
      stop: stopRecordingSpy,
    }))
    startRumSpy = jasmine.createSpy().and.callFake(() => {
      const configuration: Partial<Configuration> = {}
      return ({ configuration } as unknown) as ReturnType<StartRum>
    })
    rumGlobal = makeRumRecorderPublicApi(startRumSpy, startRecordingSpy)
  })

  function getCommonContext() {
    return startRumSpy.calls.first().args[1]()
  }

  describe('init', () => {
    it('starts RUM when init is called', () => {
      expect(startRumSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRumSpy).toHaveBeenCalled()
    })

    it('starts recording when init() is called', () => {
      expect(startRecordingSpy).not.toHaveBeenCalled()
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      expect(startRecordingSpy).toHaveBeenCalled()
    })

    it('does not start recording when calling init() with manualSessionReplayRecordingStart: true', () => {
      rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('startSessionReplayRecording()', () => {
    it('ignores calls while recording is already started', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      rumGlobal.startSessionReplayRecording()
      rumGlobal.startSessionReplayRecording()
      rumGlobal.startSessionReplayRecording()
      expect(startRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('starts recording if called before init()', () => {
      rumGlobal.startSessionReplayRecording()
      rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(startRecordingSpy).toHaveBeenCalled()
    })
  })

  describe('stopSessionReplayRecording()', () => {
    it('ignores calls while recording is already stopped', () => {
      rumGlobal.init(DEFAULT_INIT_CONFIGURATION)
      rumGlobal.stopSessionReplayRecording()
      rumGlobal.stopSessionReplayRecording()
      rumGlobal.stopSessionReplayRecording()
      expect(stopRecordingSpy).toHaveBeenCalledTimes(1)
    })

    it('does not start recording if called before init()', () => {
      rumGlobal.stopSessionReplayRecording()
      rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION })
      expect(startRecordingSpy).not.toHaveBeenCalled()
    })
  })

  describe('commonContext hasReplay', () => {
    it('is true only if recording', () => {
      rumGlobal.init({ ...DEFAULT_INIT_CONFIGURATION, manualSessionReplayRecordingStart: true })
      expect(getCommonContext().hasReplay).toBeUndefined()
      rumGlobal.startSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBe(true)
      rumGlobal.stopSessionReplayRecording()
      expect(getCommonContext().hasReplay).toBeUndefined()
    })
  })
})
