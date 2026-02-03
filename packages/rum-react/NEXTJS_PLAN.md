# Next.js App Router Integration Plan

## Overview

Create a Next.js App Router integration as a new entry point within `@datadog/browser-rum-react` package (following the react-router-v6/v7 pattern). This integration will provide automatic route tracking, error boundary support, and component performance tracking for Next.js 13+ applications.

**Package**: `@datadog/browser-rum-react/nextjs`

## Architecture Decisions

### 1. Package Structure

- **Extend rum-react** with `/nextjs` entry point (not a separate package)
- Maximizes code reuse for ErrorBoundary and UNSTABLE_ReactComponentTracker
- Follows established pattern of react-router-v6/v7 entry points

### 2. Initialization Patterns

Support **both** patterns to accommodate different use cases:

- **DatadogRumProvider component** (primary/recommended): For use in app/layout.tsx
- **Instrumentation file approach**: For early initialization using instrumentation-client.ts

### 3. View Naming Strategy

- **Automatic pattern detection**: Like React Router, view names use patterns not actual values
- Built-in transformation: `/product/123` → `/product/:id`, `/user/abc-123-def` → `/user/:uuid`
- Works automatically with no configuration required (matches React Router behavior)

### 4. Plugin Configuration

- Add `nextjs: boolean` flag to `ReactPluginConfiguration`
- When enabled, sets `trackViewsManually: true` automatically

## Components & Exports

### Main Exports (from `@datadog/browser-rum-react/nextjs`)

**Initialization:**

- `DatadogRumProvider` - Component wrapper for automatic route tracking
- `initDatadogRum(config)` - Helper for instrumentation file usage

**Error Tracking:**

- `ErrorBoundary` - Reused from rum-react
- `addReactError` - Reused from rum-react

**Performance:**

- `UNSTABLE_ReactComponentTracker` - Reused from rum-react

**Manual Control (Advanced):**

- `usePathnameTracker()` - Hook for custom tracking logic (rare use case)

**Types:**

- `NextjsRumConfig` - Configuration interface for instrumentation file
- `DatadogRumProviderProps` - Provider component props

## Implementation Files

### New Files Created

#### Core Integration

```
packages/rum-react/src/domain/nextjs/
├── index.ts                           # Barrel export
├── types.ts                           # TypeScript interfaces
├── datadogRumProvider.tsx             # Main provider component
├── datadogRumProvider.spec.tsx        # Provider tests
├── usePathnameTracker.ts              # Route change detection hook
├── usePathnameTracker.spec.ts         # Hook tests
├── startNextjsView.ts                 # View creation logic
├── startNextjsView.spec.ts            # View creation tests
├── normalizeViewName.ts               # Internal view name normalization
├── normalizeViewName.spec.ts          # Normalization tests
└── initDatadogRum.ts                  # Instrumentation file helper
```

#### Entry Point

```
packages/rum-react/src/entries/
└── nextjs.ts                          # Main entry point

packages/rum-react/nextjs/
├── package.json                       # Points to ../esm/entries/nextjs.js
└── typedoc.json                       # Documentation config
```

### Files Modified

**packages/rum-react/src/domain/reactPlugin.ts**

- Add `nextjs?: boolean` to `ReactPluginConfiguration` interface
- Set `trackViewsManually: true` when `nextjs: true`

**packages/rum-react/package.json**

- Add `"next": ">=13"` to `peerDependencies`
- Mark as optional in `peerDependenciesMeta`

**packages/rum-react/README.md**

- Add Next.js App Router section with usage examples

## Technical Implementation Details

### 1. DatadogRumProvider Component

```typescript
// src/domain/nextjs/datadogRumProvider.tsx
'use client'

export function DatadogRumProvider({ children }: DatadogRumProviderProps) {
  usePathnameTracker()
  return <>{children}</>
}
```

**Key features:**

- Must be client component (`'use client'` directive)
- Uses `usePathnameTracker` internally
- Automatically normalizes dynamic segments (no configuration needed)
- Transparent wrapper (no DOM nodes)
- Always tracks initial page load (matches React Router behavior)

### 2. usePathnameTracker Hook

```typescript
// src/domain/nextjs/usePathnameTracker.ts
import { usePathname } from 'next/navigation'
import { useRef, useEffect } from 'react'

export function usePathnameTracker() {
  const pathname = usePathname()
  const pathnameRef = useRef<string | null>(null)

  useEffect(() => {
    if (pathnameRef.current !== pathname) {
      pathnameRef.current = pathname
      startNextjsView(pathname)
    }
  }, [pathname])
}
```

**Implementation notes:**

- Uses Next.js `usePathname()` hook
- `useRef` to avoid unnecessary re-renders
- `useEffect` to ensure client-side only execution
- Tracks initial page load (consistent with React Router)
- Automatically normalizes view names (no config needed)

### 3. startNextjsView Function

```typescript
// src/domain/nextjs/startNextjsView.ts
export function startNextjsView(pathname: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.nextjs) {
      display.warn('`nextjs: true` is missing from the react plugin configuration, ' + 'the view will not be tracked.')
      return
    }

    const viewName = normalizeViewName(pathname)
    rumPublicApi.startView(viewName)
  })
}
```

**Key behaviors:**

- Uses `onRumInit` subscription pattern (from reactPlugin)
- Checks `configuration.nextjs` flag
- Applies automatic view name normalization
- Calls `rumPublicApi.startView()` with normalized name

### 4. View Name Normalization (Internal)

```typescript
// src/domain/nextjs/normalizeViewName.ts

/**
 * Internal function that automatically normalizes pathnames to route patterns.
 * Mimics React Router behavior where view names use placeholders.
 *
 * Examples:
 * /product/123 -> /product/:id
 * /user/abc-123-def-456 -> /user/:uuid
 * /orders/456/items/789 -> /orders/:id/items/:id
 */
export function normalizeViewName(pathname: string): string {
  return (
    pathname
      // Replace UUID segments first (more specific pattern)
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?=\/|[?#]|$)/gi, '/:uuid')
      // Replace numeric segments
      .replace(/\/\d+(?=\/|[?#]|$)/g, '/:id')
  )
}
```

**Note**: This function is internal and not exported. It automatically applies pattern detection to match React Router's behavior of showing route patterns rather than actual values.

### 5. Instrumentation File Helper

```typescript
// src/domain/nextjs/initDatadogRum.ts

/**
 * Helper for Next.js instrumentation-client.ts file.
 * Initializes RUM and sets up global error tracking.
 */
export function initDatadogRum(config: NextjsRumConfig, datadogRum: RumPublicApi): void {
  if (typeof window === 'undefined') {
    // Server-side guard
    return
  }

  const { datadogConfig, nextjsConfig } = config
  const nextjsPlugin = reactPlugin({ nextjs: true })
  const existingPlugins = (datadogConfig.plugins || []) as Array<typeof nextjsPlugin>

  datadogRum.init({
    ...datadogConfig,
    plugins: [nextjsPlugin].concat(existingPlugins),
  })

  // Optional: Set up early error capture
  if (nextjsConfig?.captureEarlyErrors) {
    addEventListener({}, window, 'error', (event) => {
      datadogRum.addError(event.error)
    })

    addEventListener({}, window, 'unhandledrejection', (event: PromiseRejectionEvent) => {
      datadogRum.addError(event.reason)
    })
  }
}
```

## Usage Patterns

### Pattern 1: DatadogRumProvider (Recommended)

```typescript
// app/components/datadog-provider.tsx
'use client'
import { DatadogRumProvider } from '@datadog/browser-rum-react/nextjs'

export function DatadogProvider({ children }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}

// app/layout.tsx
import { datadogRum } from '@datadog/browser-rum'
import { reactPlugin } from '@datadog/browser-rum-react'
import { DatadogProvider } from './components/datadog-provider'

datadogRum.init({
  applicationId: '<ID>',
  clientToken: '<TOKEN>',
  site: 'datadoghq.com',
  plugins: [reactPlugin({ nextjs: true })],
})

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <DatadogProvider>{children}</DatadogProvider>
      </body>
    </html>
  )
}
```

### Pattern 2: Instrumentation File (Advanced)

```typescript
// instrumentation-client.ts
import { initDatadogRum } from '@datadog/browser-rum-react/nextjs'

export function register() {
  initDatadogRum({
    datadogConfig: {
      applicationId: '<ID>',
      clientToken: '<TOKEN>',
      site: 'datadoghq.com',
    },
    nextjsConfig: {
      captureEarlyErrors: true,
    }
  })
}

// app/components/router-tracker.tsx
'use client'
import { usePathnameTracker } from '@datadog/browser-rum-react/nextjs'

export function RouterTracker() {
  usePathnameTracker()
  return null
}

// app/layout.tsx
import { RouterTracker } from './components/router-tracker'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <RouterTracker />
        {children}
      </body>
    </html>
  )
}
```

## Error Tracking Integration

### With Next.js error.js

```typescript
// app/error.tsx
'use client'
import { useEffect } from 'react'
import { addReactError } from '@datadog/browser-rum-react/nextjs'

export default function Error({ error, reset }) {
  useEffect(() => {
    addReactError(error, { componentStack: '' })
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### With Datadog ErrorBoundary

```typescript
// app/layout.tsx or page-level
import { ErrorBoundary } from '@datadog/browser-rum-react/nextjs'

function ErrorFallback({ error, resetError }) {
  return (
    <div>
      <h2>Error: {error.message}</h2>
      <button onClick={resetError}>Reset</button>
    </div>
  )
}

export default function Layout({ children }) {
  return (
    <ErrorBoundary fallback={ErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}
```

## Performance Tracking

```typescript
// app/dashboard/page.tsx
'use client'
import { UNSTABLE_ReactComponentTracker } from '@datadog/browser-rum-react/nextjs'
import { DashboardWidget } from './components/widget'

export default function DashboardPage() {
  return (
    <UNSTABLE_ReactComponentTracker name="DashboardPage">
      <DashboardWidget />
    </UNSTABLE_ReactComponentTracker>
  )
}
```

## Success Criteria

- ✅ View tracking works for Next.js App Router navigation
- ✅ Dynamic routes normalized with pattern detection
- ✅ Error tracking integrates with Next.js error boundaries
- ✅ Component performance tracking works client-side
- ✅ Both initialization patterns supported and documented
- ✅ >90% test coverage for new code
- ✅ Zero TypeScript errors
- ✅ Works with Next.js 13, 14, 15
- ✅ Clear documentation with multiple examples
- ✅ <5 minute setup time for developers
- ✅ Aligns with React Router behavior (always tracks initial load)
