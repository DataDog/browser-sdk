# Next.js Integration - Next Steps

## Current Status

✅ **Phase 1 & 2 Complete**: Core implementation finished

- All source files created and tested
- TypeScript compilation successful
- Unit tests passing (27 tests)
- Linting passes
- Build artifacts generated

## Remaining Work

### Phase 3: E2E Testing

Create a comprehensive test application and automated E2E tests.

#### 3.1 Create Test Application

**Location**: `test/apps/nextjs-app-router/`

**Structure**:

```
test/apps/nextjs-app-router/
├── app/
│   ├── layout.tsx              # With DatadogRumProvider
│   ├── page.tsx                # Home page
│   ├── about/page.tsx          # Static route
│   ├── product/[id]/page.tsx   # Numeric dynamic route
│   ├── user/[uuid]/page.tsx    # UUID dynamic route
│   ├── blog/[...slug]/page.tsx # Catch-all route
│   ├── error.tsx               # Error boundary
│   └── components/
│       └── datadog-provider.tsx # Client component wrapper
├── next.config.js
├── package.json
├── tsconfig.json
└── README.md
```

#### 3.2 Playwright E2E Tests

**Location**: `test/e2e/scenarios/nextjs-app-router.scenario.ts`

**Test Cases**:

1. ✅ **Initial Load**: Verify view created on first page load
2. ✅ **Static Navigation**: Navigate from `/` to `/about`, verify new view
3. ✅ **Dynamic Routes - Numeric**: Navigate to `/product/123`, verify view name is `/product/:id`
4. ✅ **Dynamic Routes - UUID**: Navigate to `/user/abc-123-def`, verify view name is `/user/:uuid`
5. ✅ **Dynamic Routes - Multiple**: Test `/orders/456/items/789` → `/orders/:id/items/:id`
6. ✅ **Catch-all Routes**: Navigate to `/blog/2024/01/post`, verify tracking
7. ✅ **Browser Navigation**: Test back/forward buttons
8. ✅ **Error Tracking**: Trigger error, verify captured in Datadog
9. ✅ **View Name Uniqueness**: Different products create same view name pattern
10. ✅ **Query Parameters**: Verify `/product/123?sort=asc` tracked correctly
11. ✅ **Hash Fragments**: Verify `/product/123#reviews` tracked correctly
12. ✅ **SSR/Hydration**: Ensure no hydration mismatches

**Commands**:

```bash
# Setup (one time)
yarn test:e2e:init

# Run Next.js tests
yarn test:e2e -g "nextjs"
```

### Phase 4: Documentation

Update package documentation with comprehensive examples.

#### 4.1 Update README

**Location**: `packages/rum-react/README.md`

**Sections to Add**:

1. **Next.js App Router Integration** (new section)
   - Quick start guide
   - Installation instructions
   - Basic setup example
   - Both initialization patterns
   - View name normalization explanation

2. **Advanced Usage**
   - Error boundary integration
   - Component performance tracking
   - Instrumentation file pattern
   - Custom view names (if needed)

3. **Migration Guide**
   - From manual integration
   - From Pages Router (if applicable)

4. **Troubleshooting**
   - Common issues
   - Configuration checklist
   - Debugging tips

#### 4.2 API Documentation

Ensure TypeDoc generates proper documentation:

- Add `packages/rum-react/nextjs/typedoc.json`
- Verify JSDoc comments are complete
- Generate and review docs: `yarn docs:serve`

#### 4.3 Code Examples

Create example repository or folder:

```
examples/nextjs-app-router/
├── basic/                  # Basic DatadogRumProvider setup
├── instrumentation/        # Using instrumentation-client.ts
├── error-handling/         # Error boundary examples
└── performance-tracking/   # Component tracking examples
```

### Phase 5: Manual Testing

Test with real Next.js applications across different versions.

#### 5.1 Version Compatibility Testing

Test with:

- ✅ **Next.js 13.x** (App Router introduced)
- ✅ **Next.js 14.x** (Current stable)
- ✅ **Next.js 15.x** (Latest)

Test with:

- ✅ **React 18.x**
- ✅ **React 19.x**

#### 5.2 Manual Test Checklist

- [ ] Install package in fresh Next.js 13+ app
- [ ] Import from `@datadog/browser-rum-react/nextjs` works
- [ ] Add `DatadogRumProvider` to root layout
- [ ] Initialize with `reactPlugin({ nextjs: true })`
- [ ] Navigate between pages, verify views in Datadog RUM UI
- [ ] Check view names match expected patterns (e.g., `/product/:id`)
- [ ] Trigger errors, verify captured in Datadog
- [ ] Add `UNSTABLE_ReactComponentTracker`, verify performance metrics
- [ ] Test SSR (check for hydration errors in console)
- [ ] Test with TypeScript strict mode
- [ ] Verify bundle size impact

#### 5.3 Integration Testing

- [ ] Test with common Next.js middleware patterns
- [ ] Test with internationalization (i18n)
- [ ] Test with authentication flows
- [ ] Test with API routes
- [ ] Test with server actions
- [ ] Verify no memory leaks on navigation

### Phase 6: Release Preparation

#### 6.1 Changelog

Add entry to `CHANGELOG.md`:

```markdown
## [6.27.0] - YYYY-MM-DD

### Added

- Next.js App Router integration (`@datadog/browser-rum-react/nextjs`)
  - Automatic route tracking with view name normalization
  - Support for dynamic routes (numeric IDs and UUIDs)
  - DatadogRumProvider component for easy setup
  - initDatadogRum helper for instrumentation file pattern
  - Compatible with Next.js 13, 14, 15
```

#### 6.2 Migration Guide

Document for users migrating from manual Next.js integration.

#### 6.3 Announcement

Prepare announcement for:

- Datadog blog post
- GitHub release notes
- Documentation site

## Optional Enhancements

These features can be added in future versions based on user feedback.

### Optional 1: `trackInitialLoad` Option

Add back the ability to skip initial load tracking for advanced use cases.

**Use Case**: Users who want to manually create the initial view with custom context.

**Implementation**:

```typescript
export interface UsePathnameTrackerOptions {
  /**
   * Whether to track the initial page load.
   *
   * @default true
   */
  trackInitialLoad?: boolean
}

export interface DatadogRumProviderProps {
  children: ReactNode

  /**
   * Whether to track the initial page load.
   *
   * @default true
   */
  trackInitialLoad?: boolean
}
```

**Example Usage**:

```typescript
// instrumentation-client.ts - runs very early
export function register() {
  initDatadogRum(config, datadogRum)

  // Manually create initial view with custom data
  datadogRum.startView({
    name: '/home',
    context: { experimentVariant: 'A' }
  })
}

// app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {/* Skip initial load since we handled it manually above */}
        <DatadogRumProvider trackInitialLoad={false}>
          {children}
        </DatadogRumProvider>
      </body>
    </html>
  )
}
```

**Priority**: Low (only add if users request it)

### Optional 2: Custom View Name Transformer

Allow users to customize view name normalization.

**Use Case**: Users with custom dynamic route patterns not covered by default normalization.

**Implementation**:

```typescript
export interface NextjsPluginConfiguration {
  /**
   * Custom function to normalize view names.
   * If not provided, uses default normalization (numeric IDs and UUIDs).
   */
  normalizeViewName?: (pathname: string) => string
}

// Usage
reactPlugin({
  nextjs: true,
  normalizeViewName: (pathname) => {
    // Custom logic
    return pathname.replace(/\/sku-\d+/g, '/:sku')
  },
})
```

**Priority**: Low (most users should be fine with default behavior)

### Optional 3: Pages Router Support

Extend to support Next.js Pages Router (not just App Router).

**Implementation**: Similar pattern but using `next/router` instead of `next/navigation`.

**Priority**: Medium (if users request it, but App Router is the future)

### Optional 4: Middleware Integration

Provide helper for tracking in Next.js middleware.

**Use Case**: Track server-side redirects, authentication checks, etc.

**Priority**: Low (most tracking is client-side)

### Optional 5: TypedRoutes Support

Integration with Next.js experimental typed routes feature.

**Priority**: Low (experimental feature, wait for stability)

## Questions to Resolve

1. **Should we provide a Next.js plugin/template?**
   - Create a `create-next-app` template with Datadog pre-configured
   - Or a Next.js plugin that auto-configures the integration

2. **Should we support Pages Router?**
   - Current implementation is App Router only
   - Pages Router uses different APIs (`next/router` vs `next/navigation`)

3. **How should we handle incremental static regeneration (ISR)?**
   - View tracking might behave differently
   - Need to test and document

4. **Should view names be configurable?**
   - Current: automatic normalization (not configurable)
   - Alternative: allow custom patterns via configuration

5. **How should we handle middleware tracking?**
   - Currently focused on client-side tracking
   - Server-side tracking might need different approach

## Timeline Estimate

- **Phase 3 (E2E Testing)**: 3-5 days
- **Phase 4 (Documentation)**: 2-3 days
- **Phase 5 (Manual Testing)**: 2-3 days
- **Phase 6 (Release Prep)**: 1 day

**Total**: ~2 weeks for complete release-ready state

## Success Metrics

After release, track:

- Adoption rate (npm downloads)
- GitHub issues related to Next.js integration
- User feedback and feature requests
- Performance impact reports
- Documentation clarity (support tickets)
