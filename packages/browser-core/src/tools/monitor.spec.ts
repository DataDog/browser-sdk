import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { callMonitored, monitored, startMonitorErrorCollection } from './monitor'

describe('monitor', () => {
  let onMonitorErrorCollectedSpy: Mock<(error: unknown) => void>

  beforeEach(() => {
    onMonitorErrorCollectedSpy = vi.fn()
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
    expect(onMonitorErrorCollectedSpy).toHaveBeenCalledWith(new Error('error'))
  })
})
