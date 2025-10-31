import disallowSideEffects from './disallowSideEffects.js'
import disallowEnumExports from './disallowEnumExports.js'
import disallowSpecImport from './disallowSpecImport.js'
import disallowProtectedDirectoryImport from './disallowProtectedDirectoryImport.js'
import disallowTestImportExportFromSrc from './disallowTestImportExportFromSrc.js'
import disallowZoneJsPatchedValues from './disallowZoneJsPatchedValues.js'
import disallowUrlConstructorPatchValues from './disallowUrlConstructorPatchValues.js'
import disallowGenericUtils from './disallowGenericUtils.js'
import disallowNonScripts from './disallowNonScripts.js'
import enforceProdDepsImports from './enforceProdDepsImports.js'
import secureCommandExecution from './secureCommandExecution.js'
import monitorUntilCommentRules from './monitorUntilCommentRules.js'

// Declare the local rules used by the Browser SDK
//
// See https://eslint.org/docs/developer-guide/working-with-rules for documentation on how to write
// rules.
//
// You can use https://astexplorer.net/ to explore the parsed data structure of a code snippet.
// Choose '@typescript-eslint/parser' as a parser to have the exact same structure as our ESLint
// parser.
export default {
  'disallow-side-effects': disallowSideEffects,
  'disallow-enum-exports': disallowEnumExports,
  'disallow-spec-import': disallowSpecImport,
  'disallow-protected-directory-import': disallowProtectedDirectoryImport,
  'disallow-test-import-export-from-src': disallowTestImportExportFromSrc,
  'disallow-zone-js-patched-values': disallowZoneJsPatchedValues,
  'disallow-url-constructor-patched-values': disallowUrlConstructorPatchValues,
  'disallow-generic-utils': disallowGenericUtils,
  'disallow-non-scripts': disallowNonScripts,
  'enforce-prod-deps-imports': enforceProdDepsImports,
  'secure-command-execution': secureCommandExecution,
  ...monitorUntilCommentRules,
}
