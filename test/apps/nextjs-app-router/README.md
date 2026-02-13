# Next.js App Router Test App

Test application for the `@datadog/browser-rum-react/nextjs` integration.

## Rebuilding After Changes

When you make changes to the SDK packages, run these commands:

### One-liner (from repo root)

```bash
cd packages/rum-react && yarn build && yarn pack --out package.tgz && cd ../../test/apps/nextjs-app-router && rm -rf node_modules && yarn cache clean --all && yarn install && yarn dev
```

### Step by step

```bash
# 1. Build and pack rum-react (from repo root)
cd packages/rum-react
yarn build
yarn pack --out package.tgz

# 2. Reinstall in test app
cd ../../test/apps/nextjs-app-router
rm -rf node_modules
yarn cache clean --all
yarn install

# 3. Start dev server
yarn dev
```

App available at http://localhost:3000

## Test Routes

- `/` - Home page
- `/user/42` - Dynamic route (normalizes to `/user/:id`)
- `/tracked` - Component tracking demo
- `/error-test` - Error boundary testing

## E2E Tests

E2E tests are in `test/e2e/scenario/nextjs.scenario.ts`.

### Running E2E Tests

```bash
# From repo root - starts both dev servers automatically
yarn test:e2e -g "nextjs"
```

The Playwright config automatically starts the Next.js dev server on port 3000.
