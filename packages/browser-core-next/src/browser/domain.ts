/**
 * Get the root domain for cross-subdomain cookie sharing.
 *
 * `sub.example.com` → `.example.com`
 * `example.com` → `.example.com`
 * `localhost` → `localhost`
 */
function getCurrentSiteDomain(): string {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname
  }
  const parts = hostname.split('.')
  if (parts.length <= 2) {
    return `.${hostname}`
  }
  // Return the last two parts as the root domain
  return `.${parts.slice(-2).join('.')}`
}

export { getCurrentSiteDomain }
