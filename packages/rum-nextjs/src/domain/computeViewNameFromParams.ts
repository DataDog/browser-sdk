export function computeViewNameFromParams(
  pathname: string,
  params: Record<string, string | string[] | undefined>
): string {
  if (!params || Object.keys(params).length === 0) {
    return pathname
  }

  const segments = pathname.split('/')

  for (const [paramName, paramValue] of Object.entries(params)) {
    if (paramValue === undefined) {
      continue
    }

    if (Array.isArray(paramValue)) {
      if (paramValue.length === 0) {
        continue
      }
      for (let i = 0; i < segments.length; i++) {
        if (i + paramValue.length <= segments.length && paramValue.every((v, j) => segments[i + j] === v)) {
          segments.splice(i, paramValue.length, `[...${paramName}]`)
          break
        }
      }
    } else if (paramValue) {
      const index = segments.indexOf(paramValue)
      if (index !== -1) {
        segments[index] = `[${paramName}]`
      }
    }
  }

  return segments.join('/')
}
