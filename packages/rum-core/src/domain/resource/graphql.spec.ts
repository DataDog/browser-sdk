import { describe, expect, it } from 'vitest'
import { mockRumConfiguration } from '../../../test'
import type { RequestCompleteEvent } from '../requestCollection'
import {
  extractGraphQlMetadata,
  extractGraphQlRequestMetadata,
  findGraphQlConfiguration,
  parseGraphQlResponse,
} from './graphql'

describe('GraphQL detection and metadata extraction', () => {
  describe('findGraphQlConfiguration', () => {
    it('should detect GraphQL requests matching string URLs', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [
          { match: 'http://localhost/graphql', trackPayload: false },
          { match: 'https://api.example.com/graphql', trackPayload: false },
        ],
      })

      expect(findGraphQlConfiguration('https://api.example.com/graphql', configuration)).toBeTruthy()
      expect(findGraphQlConfiguration('http://localhost/api', configuration)).toBeUndefined()
    })

    it('should detect GraphQL requests matching regex patterns', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [{ match: /\/graphql$/i, trackPayload: false }],
      })

      expect(findGraphQlConfiguration('/api/graphql', configuration)).toBeTruthy()
      expect(findGraphQlConfiguration('/graphql/admin', configuration)).toBeUndefined()
    })

    it('should detect GraphQL requests matching function matchers', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [{ match: (url: string) => url.includes('gql'), trackPayload: false }],
      })

      expect(findGraphQlConfiguration('/api/gql', configuration)).toBeTruthy()
      expect(findGraphQlConfiguration('/gql-endpoint', configuration)).toBeTruthy()
      expect(findGraphQlConfiguration('/api/rest', configuration)).toBeUndefined()
    })
  })

  describe('extractGraphQlRequestMetadata', () => {
    it('should extract query operation type and name from POST request body', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should handle empty variables object', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: {},
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{}',
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should handle null variables', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: null,
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should return undefined for invalid JSON in POST body', () => {
      const result = extractGraphQlRequestMetadata(
        { method: 'POST', url: '/graphql', requestBody: 'not valid json' },
        true
      )
      expect(result).toBeUndefined()
    })

    it('should return metadata with undefined fields for non-GraphQL POST request body', () => {
      const requestBody = JSON.stringify({ data: 'some data' })
      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)
      expect(result).toEqual({
        operationType: undefined,
        operationName: undefined,
        variables: undefined,
        payload: undefined,
      })
    })

    it('should handle GraphQL queries with leading and trailing whitespace', () => {
      const requestBody = JSON.stringify({
        query: '  \n  query GetUser { user { id name } }  \n  ',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should return undefined for queries with missing operation type', () => {
      const requestBody = JSON.stringify({
        query: '{ user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)
      expect(result).toEqual({
        operationType: undefined,
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: '{ user { id name } }',
      })
    })

    it('should return undefined for queries with invalid operation type', () => {
      const requestBody = JSON.stringify({
        query: 'invalid GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)
      expect(result).toEqual({
        operationType: undefined,
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: 'invalid GetUser { user { id name } }',
      })
    })

    it('should extract operation name and variables when query is absent in POST body', () => {
      const requestBody = JSON.stringify({
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result).toEqual({
        operationType: undefined,
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: undefined,
      })
    })

    it('should extract metadata from URL query params for GET requests with persisted queries', () => {
      const url =
        'http://example.com/graphql?operationName=GetUser&variables=%7B%22id%22%3A%22123%22%7D&extensions=%7B%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22abc123%22%7D%7D'

      const result = extractGraphQlRequestMetadata({ method: 'GET', url, requestBody: undefined }, false)

      expect(result).toEqual({
        operationType: undefined,
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: undefined,
      })
    })

    it('should use body for POST and URL params for GET', () => {
      const requestBody = JSON.stringify({
        query: 'query FromBody { user { id } }',
        operationName: 'FromBody',
      })
      const url = 'http://example.com/graphql?operationName=FromUrl'

      const postResult = extractGraphQlRequestMetadata({ method: 'POST', url, requestBody }, true)
      expect(postResult?.operationName).toBe('FromBody')

      const getResult = extractGraphQlRequestMetadata({ method: 'GET', url, requestBody }, true)
      expect(getResult?.operationName).toBe('FromUrl')
    })

    it('should return metadata with undefined fields for GET request with URL that has no GraphQL params', () => {
      const result = extractGraphQlRequestMetadata(
        { method: 'GET', url: 'http://example.com/graphql', requestBody: undefined },
        false
      )

      expect(result).toEqual({
        operationType: undefined,
        operationName: undefined,
        variables: undefined,
        payload: undefined,
      })
    })

    it('should return metadata with undefined fields for GET request with URL with unrelated query params', () => {
      const result = extractGraphQlRequestMetadata(
        { method: 'GET', url: 'http://example.com/graphql?foo=bar&baz=qux', requestBody: undefined },
        false
      )

      expect(result).toEqual({
        operationType: undefined,
        operationName: undefined,
        variables: undefined,
        payload: undefined,
      })
    })

    it('should extract query from URL params and detect operation type for GET requests', () => {
      const url = 'http://example.com/graphql?query=query%20GetUser%20%7B%20user%20%7D&operationName=GetUser'

      const result = extractGraphQlRequestMetadata({ method: 'GET', url, requestBody: undefined }, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: 'query GetUser { user }',
      })
    })

    it('should omit variables for GET request when URL variables param is invalid JSON', () => {
      const url = 'http://example.com/graphql?operationName=GetUser&variables=not-valid-json'

      const result = extractGraphQlRequestMetadata({ method: 'GET', url, requestBody: undefined }, false)

      expect(result).toEqual({
        operationType: undefined,
        operationName: 'GetUser',
        variables: undefined,
        payload: undefined,
      })
    })

    it('should return undefined for unsupported HTTP methods', () => {
      const requestBody = JSON.stringify({ query: 'query GetUser { user { id } }' })
      const result = extractGraphQlRequestMetadata(
        { method: 'PUT', url: 'http://example.com/graphql', requestBody },
        true
      )
      expect(result).toBeUndefined()
    })
  })

  describe('request payload truncation', () => {
    it('should not truncate payload under 32KB', () => {
      const shortQuery = 'query GetUser { user { id } }'
      const requestBody = JSON.stringify({
        query: shortQuery,
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result?.payload).toBe(shortQuery)
    })

    it('should truncate payload over 32KB', () => {
      const longQuery = `query LongQuery { ${'a'.repeat(33000)} }`
      const requestBody = JSON.stringify({
        query: longQuery,
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, true)

      expect(result?.payload?.length).toBe(32768 + 3)
      expect(result?.payload?.endsWith('...')).toBe(true)
      expect(result?.payload?.startsWith('query LongQuery {')).toBe(true)
    })

    it('should not include payload when trackPayload is false', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata({ method: 'POST', url: '/graphql', requestBody }, false)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: undefined,
      })
    })
  })

  describe('parseGraphQlResponse', () => {
    it('should extract detailed errors from GraphQL response', () => {
      const responseText = JSON.stringify({
        data: null,
        errors: [{ message: 'Field not found' }, { message: 'Unauthorized' }],
      })

      const result = parseGraphQlResponse(responseText)

      expect(result).toEqual([
        { message: 'Field not found', path: undefined, locations: undefined, code: undefined },
        { message: 'Unauthorized', path: undefined, locations: undefined, code: undefined },
      ])
    })

    it('should extract detailed errors with extensions, locations and path', () => {
      const responseText = JSON.stringify({
        data: null,
        errors: [
          {
            message: 'Field not found',
            extensions: { code: 'FIELD_NOT_FOUND' },
            locations: [{ line: 2, column: 5 }],
            path: ['user', 'profile'],
          },
        ],
      })

      const result = parseGraphQlResponse(responseText)

      expect(result).toEqual([
        {
          message: 'Field not found',
          code: 'FIELD_NOT_FOUND',
          locations: [{ line: 2, column: 5 }],
          path: ['user', 'profile'],
        },
      ])
    })

    it('should handle response without errors', () => {
      const responseText = JSON.stringify({
        data: { user: { name: 'John' } },
      })

      const result = parseGraphQlResponse(responseText)

      expect(result).toBeUndefined()
    })

    it('should handle invalid JSON', () => {
      const result = parseGraphQlResponse('not valid json')

      expect(result).toBeUndefined()
    })

    it('should handle errors with missing extensions', () => {
      const responseText = JSON.stringify({
        errors: [{ message: 'Simple error' }],
      })

      const result = parseGraphQlResponse(responseText)

      expect(result).toEqual([{ message: 'Simple error', path: undefined, locations: undefined, code: undefined }])
    })
  })

  describe('extractGraphQlMetadata', () => {
    it('should extract request metadata and response errors from RequestCompleteEvent', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id } }',
      })

      const request: RequestCompleteEvent = {
        method: 'POST',
        url: '/graphql',
        requestBody,
        responseBody: JSON.stringify({
          errors: [{ message: 'Not found' }],
        }),
      } as RequestCompleteEvent

      const result = extractGraphQlMetadata(request, {
        match: '/graphql',
        trackPayload: false,
        trackResponseErrors: true,
      })

      expect(result?.operationType).toBe('query')
      expect(result?.error_count).toBe(1)
      expect(result?.errors).toEqual([{ message: 'Not found', path: undefined, locations: undefined, code: undefined }])
    })

    it('should extract request metadata without response errors when not provided', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id } }',
      })

      const request: RequestCompleteEvent = {
        method: 'POST',
        url: '/graphql',
        requestBody,
      } as RequestCompleteEvent

      const result = extractGraphQlMetadata(request, {
        match: '/graphql',
        trackPayload: false,
        trackResponseErrors: true,
      })

      expect(result?.operationType).toBe('query')
      expect(result?.error_count).toBeUndefined()
      expect(result?.errors).toBeUndefined()
    })

    it('should handle multiple errors from RequestCompleteEvent', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id } }',
      })

      const request: RequestCompleteEvent = {
        method: 'POST',
        url: '/graphql',
        requestBody,
        responseBody: JSON.stringify({
          errors: [{ message: 'Error 1' }, { message: 'Error 2' }],
        }),
      } as RequestCompleteEvent

      const result = extractGraphQlMetadata(request, {
        match: '/graphql',
        trackPayload: false,
        trackResponseErrors: true,
      })

      expect(result?.operationType).toBe('query')
      expect(result?.error_count).toBe(2)
      expect(result?.errors).toEqual([
        { message: 'Error 1', path: undefined, locations: undefined, code: undefined },
        { message: 'Error 2', path: undefined, locations: undefined, code: undefined },
      ])
    })
  })
})
