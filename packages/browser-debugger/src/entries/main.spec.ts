import { describe, expect, it } from 'vitest'
import { datadogDebugger } from './main'

describe('datadogDebugger', () => {
  it('should only expose init, version, and onReady', () => {
    expect(datadogDebugger).toEqual({
      init: expect.any(Function),
      version: expect.any(String),
      onReady: expect.any(Function),
    })
  })
})
