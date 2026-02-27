import { getReadyState, getVisibilityState } from './page'

describe('getReadyState', () => {
  it('returns document.readyState', () => {
    spyOnProperty(document, 'readyState', 'get').and.returnValue('complete')
    expect(getReadyState()).toBe('complete')
  })
})

describe('getVisibilityState', () => {
  it('returns document.visibilityState', () => {
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('hidden')
    expect(getVisibilityState()).toBe('hidden')
  })
})
