import serverComponentLoader from './serverComponentLoader'

describe('serverComponentLoader', () => {
  function runLoader(source: string, resourcePath = '/app/page.tsx') {
    return serverComponentLoader.call({ resourcePath }, source)
  }

  describe('client components', () => {
    it('should not transform files with single-quoted use client directive', () => {
      const source = "'use client'\nexport default function Page() { return null }"
      expect(runLoader(source)).toBe(source)
    })

    it('should not transform files with double-quoted use client directive', () => {
      const source = '"use client"\nexport default function Page() { return null }'
      expect(runLoader(source)).toBe(source)
    })

    it('should not transform files with use client after whitespace', () => {
      const source = '  \'use client\'\nexport default function Page() { return null }'
      expect(runLoader(source)).toBe(source)
    })
  })

  describe('files without default export', () => {
    it('should not transform files without export default', () => {
      const source = 'export function helper() { return null }'
      expect(runLoader(source)).toBe(source)
    })
  })

  describe('named function export', () => {
    it('should wrap export default async function Name', () => {
      const source = 'export default async function UserProfile(props) {\n  return null\n}'
      const result = runLoader(source)

      expect(result).toContain("import { AsyncLocalStorage as __dd_ALS } from 'node:async_hooks'")
      expect(result).toContain("import { withComponentTrace as __dd_withComponentTrace, initComponentTraceStore as __dd_initStore } from '@datadog/browser-rum-nextjs/server'")
      expect(result).toContain('__dd_initStore(__dd_ALS)')
      expect(result).toContain('async function UserProfile(props)')
      expect(result).not.toContain('export default async function UserProfile')
      expect(result).toContain("export default __dd_withComponentTrace('UserProfile', UserProfile)")
    })

    it('should wrap export default function Name (non-async)', () => {
      const source = 'export default function Page() {\n  return null\n}'
      const result = runLoader(source)

      expect(result).toContain("__dd_withComponentTrace('Page', Page)")
      expect(result).toContain('function Page()')
      expect(result).not.toContain('export default function Page')
    })
  })

  describe('anonymous function export', () => {
    it('should wrap anonymous async function and derive name from filename', () => {
      const source = 'export default async function(props) {\n  return null\n}'
      const result = runLoader(source, '/app/user-profile/page.tsx')

      expect(result).toContain('const __dd_OriginalComponent = async function(props)')
      expect(result).toContain("__dd_withComponentTrace('Page', __dd_OriginalComponent)")
    })

    it('should wrap anonymous non-async function', () => {
      const source = 'export default function() {\n  return null\n}'
      const result = runLoader(source, '/app/layout.tsx')

      expect(result).toContain('const __dd_OriginalComponent = function()')
      expect(result).toContain("__dd_withComponentTrace('Layout', __dd_OriginalComponent)")
    })
  })

  describe('identifier export', () => {
    it('should wrap export default Identifier', () => {
      const source = 'async function MyPage() { return null }\nexport default MyPage'
      const result = runLoader(source)

      expect(result).toContain("__dd_withComponentTrace('MyPage', MyPage)")
      expect(result).not.toMatch(/^export default MyPage$/m)
    })
  })

  describe('preserves original functionality', () => {
    it('should keep the original source code intact (named function)', () => {
      const source = "import { Suspense } from 'react'\n\nexport default async function Page() {\n  const data = await fetch('/api')\n  return <Suspense><div>{data}</div></Suspense>\n}"
      const result = runLoader(source)

      expect(result).toContain("import { Suspense } from 'react'")
      expect(result).toContain("const data = await fetch('/api')")
      expect(result).toContain('<Suspense><div>{data}</div></Suspense>')
    })
  })
})
