import { callMonitored, monitored, startMonitorErrorCollection } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: jasmine.Spy<(error: unknown) => void>

  beforeEach(() => {
    onMonitorErrorCollectedSpy = jasmine.createSpy()
  })

  it('catches monitored errors but does not report them before startMonitorErrorCollection', () => {
    class Candidate {
      @monitored
      throwing() {
        throw new Error('monitored')
      }
    }
    const candidate = new Candidate()
    expect(() => candidate.throwing()).not.toThrowError()
    expect(onMonitorErrorCollectedSpy).not.toHaveBeenCalled()
  })

  it('reports errors to the collection callback after startMonitorErrorCollection', () => {
    startMonitorErrorCollection(onMonitorErrorCollectedSpy)
    callMonitored(() => {
      throw new Error('error')
    })
    expect(onMonitorErrorCollectedSpy).toHaveBeenCalledOnceWith(new Error('error'))
  })
})
