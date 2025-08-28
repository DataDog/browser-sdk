import { mockRumConfiguration } from '../../../test'
import { extractGraphQlMetadata, isGraphQlRequest } from './graphql'

describe('GraphQL detection and metadata extraction', () => {
  describe('isGraphQlRequest', () => {
    it('should detect GraphQL requests matching string URLs', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [
          { match: 'http://localhost/graphql', trackPayload: false },
          { match: 'https://api.example.com/graphql', trackPayload: false },
        ],
      })

      expect(isGraphQlRequest('https://api.example.com/graphql', configuration)).toBeTruthy()
      expect(isGraphQlRequest('http://localhost/api', configuration)).toBe(false)
    })

    it('should detect GraphQL requests matching regex patterns', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [{ match: /\/graphql$/i, trackPayload: false }],
      })

      expect(isGraphQlRequest('/api/graphql', configuration)).toBeTruthy()
      expect(isGraphQlRequest('/graphql/admin', configuration)).toBe(false)
    })

    it('should detect GraphQL requests matching function matchers', () => {
      const configuration = mockRumConfiguration({
        allowedGraphQlUrls: [{ match: (url: string) => url.includes('gql'), trackPayload: false }],
      })

      expect(isGraphQlRequest('/api/gql', configuration)).toBeTruthy()
      expect(isGraphQlRequest('/gql-endpoint', configuration)).toBeTruthy()
      expect(isGraphQlRequest('/api/rest', configuration)).toBe(false)
    })
  })

  describe('extractGraphQlMetadata', () => {
    it('should extract query operation type and name', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlMetadata(requestBody)

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

      const result = extractGraphQlMetadata(requestBody)

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

      const result = extractGraphQlMetadata(requestBody)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should return undefined for invalid JSON', () => {
      const result = extractGraphQlMetadata('not valid json')
      expect(result).toBeUndefined()
    })

    it('should return undefined for non-GraphQL request body', () => {
      const requestBody = JSON.stringify({ data: 'some data' })
      const result = extractGraphQlMetadata(requestBody)
      expect(result).toBeUndefined()
    })
  })

  describe('payload truncation', () => {
    it('should not truncate payload under 32KB', () => {
      const shortQuery = 'query GetUser { user { id } }'
      const requestBody = JSON.stringify({
        query: shortQuery,
      })

      const result = extractGraphQlMetadata(requestBody)

      expect(result?.payload).toBe(shortQuery)
    })

    it('should truncate payload over 32KB', () => {
      const longQuery = `query LongQuery { ${'a'.repeat(33000)} }`
      const requestBody = JSON.stringify({
        query: longQuery,
      })

      const result = extractGraphQlMetadata(requestBody)

      expect(result?.payload?.length).toBe(32768 + 3)
      expect(result?.payload?.endsWith('...')).toBe(true)
      expect(result?.payload?.startsWith('query LongQuery {')).toBe(true)
    })
  })
})
