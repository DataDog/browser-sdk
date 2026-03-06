import type { useParams } from 'next/navigation'

type Params = ReturnType<typeof useParams>

export function computeViewNameFromParams(pathname: string, params: Params): string {
  if (Object.keys(params).length === 0) {
    return pathname
  }

  const segments = pathname.split('/')

  // Process catch-all (array) params first to prevent their segments from being
  // consumed by regular param replacements when values overlap.
  for (const [paramName, paramValue] of Object.entries(params)) {
    if (!Array.isArray(paramValue) || paramValue.length === 0) {
      continue
    }
    for (let i = 0; i < segments.length; i++) {
      if (i + paramValue.length <= segments.length && paramValue.every((v, j) => segments[i + j] === v)) {
        segments.splice(i, paramValue.length, `[...${paramName}]`)
        break
      }
    }
  }

  // Process regular (string) params greedily left-to-right.
  // When multiple params share the same value, names are assigned left-to-right in param iteration order.
  // When a param value also appears in a static segment, the leftmost occurrence is assumed to be dynamic.
  for (const [paramName, paramValue] of Object.entries(params)) {
    if (typeof paramValue !== 'string' || !paramValue) {
      continue
    }
    const index = segments.indexOf(paramValue)
    if (index !== -1) {
      segments[index] = `[${paramName}]`
    }
  }

  return segments.join('/')
}
