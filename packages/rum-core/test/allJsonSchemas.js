/* global require */

// This file is not in TypeScript because it uses 'require.context', and we cannot type it
// correctly because:
//
// * We don't want to declare this type as a global (via TS `declare global`), because it would be
// declared all across the project.
//
// * We can't use something like `(globalThis as Something).require.context` because Webpack is
// looking for `require.context` as a standalone statement at build time.

const requireSchema = require.context(
  '../../../rum-events-format/schemas',
  true /* use sub directories */,
  /\.json*$/,
  'sync'
)

export const allJsonSchemas = requireSchema.keys().map(requireSchema)
