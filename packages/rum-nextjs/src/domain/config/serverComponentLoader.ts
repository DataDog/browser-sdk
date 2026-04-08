/**
 * Webpack/Turbopack loader that automatically wraps React Server Component
 * default exports with `withComponentTrace` for APM tracing.
 *
 * Detection: A file is treated as a server component if it does NOT start
 * with a 'use client' or "use client" directive.
 *
 * The loader handles these default export patterns:
 * - export default async function Name() {}
 * - export default function Name() {}
 * - export default async function() {}   (uses filename)
 * - export default function() {}          (uses filename)
 * - export default Name                   (identifier reference)
 */

const USE_CLIENT_RE = /^\s*['"]use client['"]/

// Named function export: export default [async] function Name(...)
const NAMED_FUNCTION_EXPORT_RE = /export\s+default\s+(async\s+)?function\s+(\w+)/

// Anonymous function export: export default [async] function(...)
const ANONYMOUS_FUNCTION_EXPORT_RE = /export\s+default\s+(async\s+)?function\s*\(/

// Identifier export: export default Name (at end of line, not followed by function keyword)
const IDENTIFIER_EXPORT_RE = /export\s+default\s+(\w+)\s*$/m

export default function serverComponentLoader(this: { resourcePath: string }, source: string): string {
  // Skip client components
  if (USE_CLIENT_RE.test(source)) {
    return source
  }

  // Skip files that don't have a default export
  if (!source.includes('export default')) {
    return source
  }

  // Import AsyncLocalStorage at the app level (where turbopack resolves node:
  // built-ins correctly) and store as a global singleton. componentTrace.ts
  // reads from this global instead of importing async_hooks itself.
  const importStatement =
    "import { AsyncLocalStorage as __dd_ALS } from 'node:async_hooks'\n" +
    "import { withComponentTrace as __dd_withComponentTrace, initComponentTraceStore as __dd_initStore } from '@datadog/browser-rum-nextjs/server'\n" +
    "__dd_initStore(__dd_ALS)\n"

  // Pattern 1: export default [async] function Name(...)
  const namedMatch = source.match(NAMED_FUNCTION_EXPORT_RE)
  if (namedMatch) {
    const componentName = namedMatch[2]
    const transformed = source.replace(
      NAMED_FUNCTION_EXPORT_RE,
      `$1function ${componentName}`
    )
    return (
      importStatement +
      transformed +
      `\nexport default __dd_withComponentTrace('${componentName}', ${componentName})\n`
    )
  }

  // Pattern 2: export default [async] function(...)  (anonymous)
  const anonMatch = source.match(ANONYMOUS_FUNCTION_EXPORT_RE)
  if (anonMatch) {
    const componentName = deriveComponentName(this.resourcePath)
    const transformed = source.replace(
      ANONYMOUS_FUNCTION_EXPORT_RE,
      `const __dd_OriginalComponent = $1function(`
    )
    return (
      importStatement +
      transformed +
      `\nexport default __dd_withComponentTrace('${componentName}', __dd_OriginalComponent)\n`
    )
  }

  // Pattern 3: export default Name (identifier)
  const identifierMatch = source.match(IDENTIFIER_EXPORT_RE)
  if (identifierMatch) {
    const componentName = identifierMatch[1]
    const transformed = source.replace(IDENTIFIER_EXPORT_RE, '')
    return (
      importStatement +
      transformed +
      `\nexport default __dd_withComponentTrace('${componentName}', ${componentName})\n`
    )
  }

  // No recognized pattern — return source unchanged
  return source
}

function deriveComponentName(resourcePath: string): string {
  // Extract filename without extension from the path (e.g. '/app/page.tsx' → 'page')
  const lastSlash = resourcePath.lastIndexOf('/')
  const filename = lastSlash >= 0 ? resourcePath.slice(lastSlash + 1) : resourcePath
  const dotIndex = filename.lastIndexOf('.')
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename
  // page → Page, layout → Layout, etc.
  return basename.charAt(0).toUpperCase() + basename.slice(1)
}
