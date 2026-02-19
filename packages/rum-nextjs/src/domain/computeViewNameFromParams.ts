export function computeViewNameFromParams(
  pathname: string,
  params: Record<string, string | string[] | undefined>
): string {
  if (!params || Object.keys(params).length === 0) {
    return pathname
  }

  let viewName = pathname

  // Sort params by value length descending to replace longer values first.
  // Prevents partial replacements (e.g., replacing '1' before '123').
  const sortedParams = Object.entries(params).sort((a, b) => {
    const aLen = Array.isArray(a[1]) ? a[1].join('/').length : (a[1]?.length ?? 0)
    const bLen = Array.isArray(b[1]) ? b[1].join('/').length : (b[1]?.length ?? 0)
    return bLen - aLen
  })

  for (const [paramName, paramValue] of sortedParams) {
    if (paramValue === undefined) continue

    if (Array.isArray(paramValue)) {
      const joinedValue = paramValue.join('/')
      if (joinedValue && viewName.includes(joinedValue)) {
        viewName = viewName.replace(joinedValue, `[...${paramName}]`)
      }
    } else if (paramValue) {
      viewName = viewName.replace(paramValue, `[${paramName}]`)
    }
  }

  return viewName
}
