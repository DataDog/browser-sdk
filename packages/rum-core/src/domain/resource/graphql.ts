import { matchList, ONE_KIBI_BYTE, safeTruncate } from '@datadog/browser-core'
import type { RumConfiguration, GraphQlUrlOption } from '../configuration'

/**
 * arbitrary value, byte precision not needed
 */
const GRAPHQL_PAYLOAD_LIMIT = 32 * ONE_KIBI_BYTE

export interface GraphQlMetadata {
  operationType: 'query' | 'mutation' | 'subscription'
  operationName?: string
  variables?: string
  payload?: string
}

export function findGraphQlConfiguration(url: string, configuration: RumConfiguration): GraphQlUrlOption | undefined {
  for (const graphQlOption of configuration.allowedGraphQlUrls) {
    if (matchList([graphQlOption.match], url)) {
      return graphQlOption
    }
  }
  return undefined
}

export function extractGraphQlMetadata(
  requestBody: unknown,
  trackPayload: boolean = false
): GraphQlMetadata | undefined {
  if (!requestBody || typeof requestBody !== 'string') {
    return undefined
  }

  let graphqlBody: { query?: string; operationName?: string; variables?: unknown }

  try {
    graphqlBody = JSON.parse(requestBody)
  } catch {
    // Not valid JSON
    return undefined
  }

  if (!graphqlBody || !graphqlBody.query) {
    return undefined
  }

  const query = graphqlBody.query.trim()
  const operationType = getOperationType(query)
  const operationName = graphqlBody.operationName

  let variables: string | undefined
  if (graphqlBody.variables !== null && graphqlBody.variables !== undefined) {
    variables = JSON.stringify(graphqlBody.variables)
  }

  return {
    operationType,
    operationName,
    variables,
    payload: trackPayload ? safeTruncate(query, GRAPHQL_PAYLOAD_LIMIT, '...') : undefined,
  }
}

function getOperationType(query: string): 'query' | 'mutation' | 'subscription' {
  const trimmedQuery = query.trim()

  if (trimmedQuery.startsWith('mutation')) {
    return 'mutation'
  } else if (trimmedQuery.startsWith('subscription')) {
    return 'subscription'
  }

  return 'query'
}
