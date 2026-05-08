---
name: manual-testing
description: Run a manual test of the current change end-to-end and output reproducible test instructions for the PR "Test instructions" section.
---

## Step 1: Understand the change

If you don't have the PR changes in memory, review all commits in the PR to identify what SDK behavior changed and what events/fields need to be verified.

## Step 2: Start the dev server

The dev server serves the `sandbox/` directory and proxies intake requests locally. Use `yarn dev-server --help` to list all available commands.

```bash
yarn dev-server start
```

## Step 3: Create a temporary sandbox page

Create `sandbox/test-<topic>.html`. See `sandbox/index.html` for a minimal example. Include only the elements needed to exercise the change. Always use `proxy: '/proxy'`.

```bash
cat > sandbox/test-<topic>.html << 'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Test <topic></title>
    <script src="/datadog-rum.js"></script>
    <script>
      DD_RUM.init({ clientToken: 'xxx', applicationId: 'xxx', proxy: '/proxy', trackUserInteractions: true })
    </script>
  </head>
  <body>
    <!-- elements needed to exercise the change -->
  </body>
</html>
EOF
```

## Step 4: Run the test flow

Get the dev server URL from `yarn dev-server status`. Clear any previous intake data, open the page, interact with it using CSS selectors, flush events by opening a new tab or reloading, then inspect the intake:

```bash
yarn dev-server intake clear
agent-browser open <dev-server-url>/test-<topic>.html
agent-browser click '#...'
agent-browser tab new
yarn dev-server intake <selector> | jq '<field>'
```

Use `yarn dev-server intake --help` to find the right selector.

To evaluate JavaScript on the page (e.g. to inspect `window` state set by `beforeSend`), switch focus back to tab 0 first, then use `agent-browser eval`:

```bash
agent-browser tab 0
agent-browser eval 'window.someValue'
```

## Step 5: Verify the output matches expectations, then present the test instructions

Output a self-contained bash snippet with the exact commands run and the expected output. This goes directly into the PR "Test instructions" section.

## Step 6: Clean up

```bash
yarn dev-server stop
rm sandbox/test-<topic>.html
```
