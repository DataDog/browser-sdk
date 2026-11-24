import { printError, printLog, runMain } from './lib/executionUtils.ts'
import {
  INTERNAL_SCOPES,
  INTERNAL_TYPES,
  PACKAGE_SCOPES,
  PUBLIC_TYPES,
  REVERT_TYPE,
} from './lib/conventionalCommits.ts'

const PUBLIC_TYPE_NAMES = new Set(PUBLIC_TYPES.map(({ type }) => type))
const TYPE_NAMES = new Set([...PUBLIC_TYPE_NAMES, ...INTERNAL_TYPES.map(({ type }) => type), REVERT_TYPE.type])
const PACKAGE_SCOPE_NAMES = new Set(PACKAGE_SCOPES.map(({ scope }) => scope))
const SCOPE_NAMES = new Set([...PACKAGE_SCOPE_NAMES, ...INTERNAL_SCOPES.map(({ scope }) => scope)])

const TITLE_REGEX = /^(?<type>[a-z]+)\((?<scopes>[^()]*)\)(?<breaking>!)?: (?<description>.*)$/
const JIRA_KEY_REGEX = /\[[A-Z][A-Z0-9]*-\d+\]/

/**
 * Check a PR title against the Conventional Commits convention described in docs/DEVELOPMENT.md.
 *
 * @returns The reasons why the title is invalid, empty if it is valid.
 */
export function validatePrTitle(title: string): string[] {
  const errors: string[] = []

  if (JIRA_KEY_REGEX.test(title)) {
    errors.push('Jira keys are not allowed in the title: add a `Refs: ABC-123` line to the PR description instead.')
  }

  const match = TITLE_REGEX.exec(title)
  if (!match) {
    if (title.startsWith('Revert "')) {
      errors.push('Revert PRs must be retitled `revert(scope): description`.')
    } else if (/^[a-z]+!?: /.test(title)) {
      errors.push('A scope is required: `type(scope): description`.')
    } else {
      errors.push('The title must match `type(scope[,scope])[!]: description`.')
    }
    return errors
  }

  const { type, breaking, description } = match.groups!
  const scopes = match.groups!.scopes.split(',').map((scope) => scope.trim())

  if (!TYPE_NAMES.has(type)) {
    errors.push(`Unknown type \`${type}\`.`)
  }

  const unknownScopes = scopes.filter((scope) => scope !== '' && !SCOPE_NAMES.has(scope))
  if (scopes.includes('')) {
    errors.push('A scope is required: `type(scope): description`.')
  }
  if (unknownScopes.length > 0) {
    errors.push(
      `Unknown scope${unknownScopes.length > 1 ? 's' : ''}: ${unknownScopes.map((s) => `\`${s}\``).join(', ')}.`
    )
  }

  const nonPackageScopes = scopes.filter((scope) => SCOPE_NAMES.has(scope) && !PACKAGE_SCOPE_NAMES.has(scope))
  if (PUBLIC_TYPE_NAMES.has(type) && nonPackageScopes.length > 0) {
    errors.push(
      `\`${type}\` is a public type and needs package scopes; internal scopes (${nonPackageScopes.join(', ')}) need an internal type.`
    )
  }

  if (breaking) {
    if (nonPackageScopes.length > 0) {
      errors.push('`!` (breaking change) is only allowed with package scopes.')
    } else if (scopes.every((scope) => scope === 'js-core')) {
      errors.push('`!` is not allowed with `js-core` alone: it would bump the whole Browser SDK a major version.')
    }
  }

  if (description.trim() === '') {
    errors.push('The description is empty.')
  }

  return errors
}

export function formatConvention(): string {
  const formatList = (items: ReadonlyArray<{ name: string; description: string }>) =>
    items.map(({ name, description }) => `  ${name.padEnd(10)} ${description}`).join('\n')

  return [
    'Public types (package scopes only):',
    formatList(PUBLIC_TYPES.map(({ type, description }) => ({ name: type, description }))),
    'Internal types (any scope):',
    formatList([...INTERNAL_TYPES, REVERT_TYPE].map(({ type, description }) => ({ name: type, description }))),
    'Package scopes:',
    formatList(PACKAGE_SCOPES.map(({ scope, description }) => ({ name: scope, description }))),
    'Internal scopes (internal types only):',
    formatList(INTERNAL_SCOPES.map(({ scope, description }) => ({ name: scope, description }))),
  ].join('\n')
}

if (!process.env.NODE_TEST_CONTEXT) {
  runMain(() => {
    const title = process.env.PR_TITLE

    if (title === undefined) {
      throw new Error('PR_TITLE environment variable is not set.')
    }

    const errors = validatePrTitle(title)
    if (errors.length === 0) {
      printLog(`PR title OK: ${title}`)
      return
    }

    printError(
      `Invalid PR title: ${title}\n\n` +
        `${errors.map((error) => `- ${error}`).join('\n')}\n\n` +
        'Examples: `feat(rum): Add view name API`, `fix(rum,logs): Drop empty context`, `ci(e2e): Quarantine flaky test`\n\n' +
        `${formatConvention()}\n\n` +
        'See docs/DEVELOPMENT.md for the full convention.'
    )
    process.exit(1)
  })
}
