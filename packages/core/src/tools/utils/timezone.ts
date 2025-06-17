export function getTimeZone() {
  // Use Intl.DateTimeFormat().resolvedOptions().timeZone to get the time zone
  // This is supported in all modern browsers and Node.js
  // Making sure to handle cases where the time zone cannot be determined
  try {
    const intl = new Intl.DateTimeFormat()

    return intl.resolvedOptions().timeZone
  } catch {
    // Fallback to a default value if the time zone cannot be determined
    return undefined
  }
}
