import { extractGraphQLMetadata } from './graphql'

describe('extractGraphQLMetadata', () => {
  it('returns empty object for a plain URL with no GraphQL params', () => {
    const result = extractGraphQLMetadata('https://example.com/api/data')
    expect(result).toEqual({})
  })

  it('extracts operationName from query param', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql?operationName=GetUser')
    expect(result.operationName).toBe('GetUser')
  })

  it('extracts operationType from query param', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql?operationType=query')
    expect(result.operationType).toBe('query')
  })

  it('extracts both operationType and operationName from query params', () => {
    const result = extractGraphQLMetadata(
      'https://example.com/graphql?operationType=mutation&operationName=CreateUser'
    )
    expect(result.operationType).toBe('mutation')
    expect(result.operationName).toBe('CreateUser')
  })

  it('supports snake_case param names for operation_name', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql?operation_name=UpdateProfile')
    expect(result.operationName).toBe('UpdateProfile')
  })

  it('supports snake_case param names for operation_type', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql?operation_type=subscription')
    expect(result.operationType).toBe('subscription')
  })

  it('infers operationType=query from path segment /query', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql/query')
    expect(result.operationType).toBe('query')
  })

  it('infers operationType=mutation from path segment /mutation', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql/mutation')
    expect(result.operationType).toBe('mutation')
  })

  it('infers operationType=subscription from path segment /subscription', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql/subscription')
    expect(result.operationType).toBe('subscription')
  })

  it('returns empty object for relative URL with no params', () => {
    const result = extractGraphQLMetadata('/graphql')
    expect(result).toEqual({})
  })

  it('extracts operationName from relative URL with query params', () => {
    const result = extractGraphQLMetadata('/graphql?operationName=ListItems')
    expect(result.operationName).toBe('ListItems')
  })

  it('returns empty object for an invalid URL', () => {
    const result = extractGraphQLMetadata(':::invalid:::')
    expect(result).toEqual({})
  })

  it('operationType param takes precedence over path inference', () => {
    const result = extractGraphQLMetadata('https://example.com/graphql/query?operationType=mutation')
    expect(result.operationType).toBe('mutation')
  })
})
