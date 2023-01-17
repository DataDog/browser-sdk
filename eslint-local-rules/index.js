// Declare the local rules used by the Browser SDK
//
// See https://eslint.org/docs/developer-guide/working-with-rules for documentation on how to write
// rules.
//
// You can use https://astexplorer.net/ to explore the parsed data structure of a code snippet.
// Choose '@typescript-eslint/parser' as a parser to have the exact same structure as our ESLint
// parser.
module.exports = {
  'disallow-side-effects': require('./disallowSideEffects'),
  'disallow-enum-exports': require('./disallowEnumExports'),
  'disallow-spec-import': require('./disallowSpecImport'),
  'disallow-protected-directory-import': require('./disallowProtectedDirectoryImport'),
  'secure-command-execution': require('./secureCommandExecution'),
}
