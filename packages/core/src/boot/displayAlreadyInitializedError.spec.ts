import { vi } from 'vitest'
import type { InitConfiguration } from '../domain/configuration'
import { display } from '../tools/display'
import { displayAlreadyInitializedError } from './displayAlreadyInitializedError'

describe('displayAlreadyInitializedError', () => {
  it('should display an error', () => {
    const displayErrorSpy = vi.spyOn(display, 'error')
    displayAlreadyInitializedError('DD_RUM', {} as InitConfiguration)
    expect(displayErrorSpy).toHaveBeenCalledTimes(1)
    expect(displayErrorSpy).toHaveBeenCalledWith('DD_RUM is already initialized.')
  })

  it('should not display an error if the "silentMultipleInit" option is used', () => {
    const displayErrorSpy = vi.spyOn(display, 'error')
    displayAlreadyInitializedError('DD_RUM', { silentMultipleInit: true } as InitConfiguration)
    expect(displayErrorSpy).not.toHaveBeenCalled()
  })
})
