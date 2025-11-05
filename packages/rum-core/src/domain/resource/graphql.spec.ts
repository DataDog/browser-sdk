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
    it('should extract query operation type and name', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata(requestBody, true)

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

      const result = extractGraphQlRequestMetadata(requestBody, true)

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

      const result = extractGraphQlRequestMetadata(requestBody, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should return undefined for invalid JSON', () => {
      const result = extractGraphQlRequestMetadata('not valid json', true)
      expect(result).toBeUndefined()
    })

    it('should return undefined for non-GraphQL request body', () => {
      const requestBody = JSON.stringify({ data: 'some data' })
      const result = extractGraphQlRequestMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })

    it('should handle GraphQL queries with leading and trailing whitespace', () => {
      const requestBody = JSON.stringify({
        query: '  \n  query GetUser { user { id name } }  \n  ',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata(requestBody, true)

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

      const result = extractGraphQlRequestMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })

    it('should return undefined for queries with invalid operation type', () => {
      const requestBody = JSON.stringify({
        query: 'invalid GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlRequestMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })
  })

  describe('request payload truncation', () => {
    it('should not truncate payload under 32KB', () => {
      const shortQuery = 'query GetUser { user { id } }'
      const requestBody = JSON.stringify({
        query: shortQuery,
      })

      const result = extractGraphQlRequestMetadata(requestBody, true)

      expect(result?.payload).toBe(shortQuery)
    })

    it('should truncate payload over 32KB', () => {
      const longQuery = `query LongQuery { ${'a'.repeat(33000)} }`
      const requestBody = JSON.stringify({
        query: longQuery,
      })

      const result = extractGraphQlRequestMetadata(requestBody, true)

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

      const result = extractGraphQlRequestMetadata(requestBody, false)

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
      expect(result?.errors_count).toBe(1)
      expect(result?.errors).toEqual([{ message: 'Not found', path: undefined, locations: undefined, code: undefined }])
    })

    it('should extract request metadata without response errors when not provided', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id } }',
      })

      const request: RequestCompleteEvent = {
        requestBody,
      } as RequestCompleteEvent

      const result = extractGraphQlMetadata(request, {
        match: '/graphql',
        trackPayload: false,
        trackResponseErrors: true,
      })

      expect(result?.operationType).toBe('query')
      expect(result?.errors_count).toBeUndefined()
      expect(result?.errors).toBeUndefined()
    })

    it('should handle multiple errors from RequestCompleteEvent', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id } }',
      })

      const request: RequestCompleteEvent = {
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
      expect(result?.errors_count).toBe(2)
      expect(result?.errors).toEqual([
        { message: 'Error 1', path: undefined, locations: undefined, code: undefined },
        { message: 'Error 2', path: undefined, locations: undefined, code: undefined },
      ])
    })
  })
})
