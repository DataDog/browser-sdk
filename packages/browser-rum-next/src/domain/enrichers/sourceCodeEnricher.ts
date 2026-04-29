function extractFirstUrl(stack: string): string | undefined {
  const match = stack.match(/https?:\/\/[^\s)]+/)
  return match?.[0]
}

function sourceCodeEnricher(_config?: { service?: string; version?: string }) {
  return {
    name: 'sourceCode',
    transform(data: Record<string, unknown>) {
      const error = data.error as Record<string, unknown> | undefined
      if (!error?.stack) return data

      const sourceUrl = extractFirstUrl(error.stack as string)
      if (!sourceUrl) return data

      return {
        ...data,
        _dd: {
          ...((data._dd as Record<string, unknown>) || {}),
          error_source_type: 'browser',
        },
      }
    },
  }
}

export { sourceCodeEnricher }
