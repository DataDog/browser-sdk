import { mockRumConfiguration } from '../../../test'
import { extractGraphQlMetadata, findGraphQlConfiguration } from './graphql'

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

  describe('extractGraphQlMetadata', () => {
    it('should extract query operation type and name', () => {
      const requestBody = JSON.stringify({
        query: 'query GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlMetadata(requestBody, true)

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

      const result = extractGraphQlMetadata(requestBody, true)

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

      const result = extractGraphQlMetadata(requestBody, true)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: undefined,
        payload: 'query GetUser { user { id name } }',
      })
    })

    it('should return undefined for invalid JSON', () => {
      const result = extractGraphQlMetadata('not valid json', true)
      expect(result).toBeUndefined()
    })

    it('should return undefined for non-GraphQL request body', () => {
      const requestBody = JSON.stringify({ data: 'some data' })
      const result = extractGraphQlMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })

    it('should handle GraphQL queries with leading and trailing whitespace', () => {
      const requestBody = JSON.stringify({
        query: '  \n  query GetUser { user { id name } }  \n  ',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlMetadata(requestBody, true)

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

      const result = extractGraphQlMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })

    it('should return undefined for queries with invalid operation type', () => {
      const requestBody = JSON.stringify({
        query: 'invalid GetUser { user { id name } }',
        operationName: 'GetUser',
        variables: { id: '123' },
      })

      const result = extractGraphQlMetadata(requestBody, true)
      expect(result).toBeUndefined()
    })
  })

  describe('payload truncation', () => {
    it('should not truncate payload under 32KB', () => {
      const shortQuery = 'query GetUser { user { id } }'
      const requestBody = JSON.stringify({
        query: shortQuery,
      })

      const result = extractGraphQlMetadata(requestBody, true)

      expect(result?.payload).toBe(shortQuery)
    })

    it('should truncate payload over 32KB', () => {
      const longQuery = `query LongQuery { ${'a'.repeat(33000)} }`
      const requestBody = JSON.stringify({
        query: longQuery,
      })

      const result = extractGraphQlMetadata(requestBody, true)

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

      const result = extractGraphQlMetadata(requestBody, false)

      expect(result).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        variables: '{"id":"123"}',
        payload: undefined,
      })
    })
  })
})
