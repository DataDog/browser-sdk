import { getTimer } from './getTimer'

describe('getTimer', () => {
  it('is able to measure time', () => {
    const timer = getTimer('test')

    timer.startTimer()
    setTimeout(() => {
      timer.stopTimer()
      expect(timer.getDuration()).toBeGreaterThan(1000)
    }, 1000)
  })
})
