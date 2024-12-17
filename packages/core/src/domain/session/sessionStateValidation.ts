export const SESSION_ENTRY_REGEXP = /^([a-zA-Z]+)=([a-z0-9-]+)$/
export const SESSION_ENTRY_SEPARATOR = '&'

export function isValidSessionString(sessionString: string | undefined | null): sessionString is string {
  return (
    !!sessionString &&
    (sessionString.indexOf(SESSION_ENTRY_SEPARATOR) !== -1 || SESSION_ENTRY_REGEXP.test(sessionString))
  )
}
