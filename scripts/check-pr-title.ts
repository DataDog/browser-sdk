import { printError, printLog, runMain } from './lib/executionUtils.ts'
import { GITMOJI, normalizeGitmoji } from './lib/gitmoji.ts'

export function isValidPrTitle(title: string): boolean {
  if (/^v\d+\.\d+\.\d+$/.test(title)) {
    return true
  }

  const normalized = normalizeGitmoji(title)
  return GITMOJI.some(({ emoji }) => normalized.startsWith(normalizeGitmoji(emoji)))
}

export function formatAllowedPrefixes(): string {
  return GITMOJI.map(({ emoji, label }) => `  ${emoji} ${label}`).join('\n')
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => {
    const title = process.env.PR_TITLE

    if (title === undefined) {
      throw new Error('PR_TITLE environment variable is not set.')
    }

    if (isValidPrTitle(title)) {
      printLog(`PR title OK: ${title}`)
      return
    }

    printError(
      'PR title must start with one of the allowed gitmoji prefixes.\n\n' +
        `Current title: ${title}\n\n` +
        `Allowed prefixes:\n${formatAllowedPrefixes()}\n\n` +
        'See docs/DEVELOPMENT.md for the full convention.'
    )
    process.exit(1)
  })
}
