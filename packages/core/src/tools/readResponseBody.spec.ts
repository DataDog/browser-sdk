import { MockResponse } from '../../test'
import { readResponseBody } from './readResponseBody'

describe('readResponseBody', () => {
  describe('for XHR requests', () => {
    it('should read string response from XHR', (done) => {
      const xhr = { response: 'test response' } as XMLHttpRequest

      readResponseBody(
        { xhr },
        (result) => {
          expect(result.body).toBe('test response')
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should return undefined for non-string XHR response', (done) => {
      const xhr = { response: { foo: 'bar' } } as XMLHttpRequest

      readResponseBody(
        { xhr },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should truncate XHR response when bytesLimit is specified', (done) => {
      const xhr = { response: 'Lorem ipsum dolor sit amet orci aliquam.' } as XMLHttpRequest

      readResponseBody(
        { xhr },
        (result) => {
          expect(result.body).toBe('Lorem ipsum dolor sit amet orci ...')
          expect(result.limitExceeded).toBe(true)
          done()
        },
        { bytesLimit: 32 }
      )
    })

    it('should not truncate XHR response when size equals limit', (done) => {
      const text = 'foo'
      const xhr = { response: text } as XMLHttpRequest

      readResponseBody(
        { xhr },
        (result) => {
          expect(result.body).toBe(text)
          expect(result.limitExceeded).toBe(false)
          done()
        },
        { bytesLimit: text.length }
      )
    })

    it('should return undefined body when XHR is not present', (done) => {
      readResponseBody(
        {},
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })
  })

  describe('for Fetch requests', () => {
    it('should read response text from Fetch', (done) => {
      const response = new MockResponse({ responseText: 'fetch response' })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBe('fetch response')
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should return undefined when response body is null', (done) => {
      const response = new MockResponse({})

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should return undefined when response body is already used', (done) => {
      const response = new MockResponse({ bodyUsed: true })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should return undefined when response body is disturbed', (done) => {
      const response = new MockResponse({ bodyDisturbed: true })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should not consume the original response body', (done) => {
      const response = new MockResponse({ responseText: 'test' })

      readResponseBody(
        { response },
        () => {
          expect(response.bodyUsed).toBe(false)
          done()
        },
        {}
      )
    })

    it('should truncate fetch response when bytesLimit is specified', (done) => {
      const text = 'Lorem ipsum dolor sit amet'
      const response = new MockResponse({ responseText: text })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBe('Lorem ipsu...')
          expect(result.limitExceeded).toBe(true)
          done()
        },
        { bytesLimit: 10 }
      )
    })

    it('should not truncate when size equals limit', (done) => {
      const text = 'foo'
      const response = new MockResponse({ responseText: text })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBe(text)
          expect(result.limitExceeded).toBe(false)
          done()
        },
        { bytesLimit: text.length }
      )
    })

    it('should handle error reading from response stream', (done) => {
      const response = new MockResponse({ responseTextError: new Error('locked') })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.error).toEqual(jasmine.any(Error))
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })

    it('should not collect body when collectBody is false', (done) => {
      const response = new MockResponse({ responseText: 'test response' })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBeUndefined()
          expect(result.limitExceeded).toBe(false)
          done()
        },
        { collectBody: false }
      )
    })

    it('should collect body by default when collectBody is not specified', (done) => {
      const response = new MockResponse({ responseText: 'test response' })

      readResponseBody(
        { response },
        (result) => {
          expect(result.body).toBe('test response')
          expect(result.limitExceeded).toBe(false)
          done()
        },
        {}
      )
    })
  })
})
