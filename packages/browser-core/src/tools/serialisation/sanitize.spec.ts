import { display } from '../display'
import { sanitize } from './sanitize'

describe('sanitize', () => {
  it('should warn through the browser-core display when data is over the limit', () => {
    const displaySpy = spyOn(display, 'warn')
    const str = 'A not so long string...'

    expect(sanitize(str, 5)).toBe(undefined)
    expect(displaySpy).toHaveBeenCalledOnceWith(
      'The data provided has been discarded as it is over the limit of 5 characters:',
      str
    )
  })
})
