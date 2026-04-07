import { datadogDebugger } from './main'

describe('datadogDebugger', () => {
  it('should only expose init, version, and onReady', () => {
    expect(datadogDebugger).toEqual({
      init: jasmine.any(Function),
      version: jasmine.any(String),
      onReady: jasmine.any(Function),
    })
  })
})
