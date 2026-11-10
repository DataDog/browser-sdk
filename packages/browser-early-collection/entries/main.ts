import { startEarlyCollection } from '../src'

// This entry is only used to build the standalone `datadog-early-collection.js` artifact:
// evaluating it starts the collection. It lives outside `src/` on purpose: the modules in
// `src/` must stay free of side effects when evaluated (see the `disallow-side-effects`
// lint rule, scoped to `packages/*/src`), and the auto-start behavior belongs exclusively
// to this script artifact, not to the package modules.
startEarlyCollection()
