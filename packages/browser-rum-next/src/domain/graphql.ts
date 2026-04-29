interface GraphQLMetadata {
  operationType?: string
  operationName?: string
}

/**
 * Extracts GraphQL metadata from a URL.
 * Looks for `operationType` and `operationName` as query parameters,
 * or falls back to parsing the URL path for known operation type segments.
 */
function extractGraphQLMetadata(url: string): GraphQLMetadata {
  let parsedUrl: URL | undefined

  try {
    // Handle relative URLs by using a dummy base
    parsedUrl = new URL(url, 'http://localhost')
  } catch {
    return {}
  }

  const params = parsedUrl.searchParams

  const operationName = params.get('operationName') ?? params.get('operation_name') ?? undefined
  const operationType = params.get('operationType') ?? params.get('operation_type') ?? undefined

  if (operationType || operationName) {
    return { operationType: operationType ?? undefined, operationName: operationName ?? undefined }
  }

  // Try to infer operation type from path segments
  const pathname = parsedUrl.pathname.toLowerCase()
  const knownTypes = ['query', 'mutation', 'subscription']
  for (const type of knownTypes) {
    if (pathname.includes(`/${type}`) || pathname.endsWith(type)) {
      return { operationType: type }
    }
  }

  return {}
}

export { extractGraphQLMetadata }
export type { GraphQLMetadata }
