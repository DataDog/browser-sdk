import { catchErrors } from './catchErrors'

describe('catchErrors', () => {
  it('returns the same result as the original function', () => {
    const wrappedFn = catchErrors((a: number, b: number) => a + b, 'Error during callback')
    expect(wrappedFn(10, 2)).toBe(12)
  })

  it('logs errors using console.error and returns undefined', () => {
    const consoleErrorSpy = spyOn(console, 'error')
    const myError = 'Ooops!'
    const wrappedFn = catchErrors(() => {
      throw myError
    }, 'Error during callback')
    expect(wrappedFn()).toBe(undefined)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during callback', myError)
  })
})
