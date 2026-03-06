function resolveTimeZone() {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return undefined
  }
}

const timeZone = resolveTimeZone()

export function getTimeZone() {
  return timeZone
}
