import { matchList, ONE_KIBI_BYTE } from '@datadog/browser-core'
import type { RumConfiguration, GraphQlUrlOption } from '../configuration'

const GRAPHQL_PAYLOAD_LIMIT = 32 * ONE_KIBI_BYTE

export interface GraphQlMetadata {
  operationType: 'query' | 'mutation' | 'subscription'
  operationName?: string
  variables?: string
  payload?: string
}

export function isGraphQlRequest(url: string, configuration: RumConfiguration): GraphQlUrlOption | false {
  for (const graphQlOption of configuration.allowedGraphQlUrls) {
    if (matchList([graphQlOption.match], url)) {
      return graphQlOption
    }
  }
  return false
}

export function extractGraphQlMetadata(requestBody: string | undefined): GraphQlMetadata | undefined {
  if (!requestBody || typeof requestBody !== 'string') {
    return undefined
  }

  let graphqlBody: { query?: string; operationName?: string; variables?: string } | undefined

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
    payload: truncatePayload(query, GRAPHQL_PAYLOAD_LIMIT),
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

function truncatePayload(payload: string, limit: number): string {
  if (payload.length > limit) {
    return `${payload.substring(0, limit)}...`
  }
  return payload
}
