import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

type MessageIds = 'reExportFromOtherPackage'
type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>

// Re-exporting from @datadog/js-core makes it look like the value belongs to the
// re-exporting package. Consumers should import it from @datadog/js-core directly.
//
// Customer-facing package entry points are excluded from this rule via the ESLint
// `ignores` config (see PUBLIC_PACKAGE_ENTRIES in eslint.config.ts).
const FORBIDDEN_RE_EXPORT_SOURCE = '@datadog/js-core'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: `Disallow re-exporting values from ${FORBIDDEN_RE_EXPORT_SOURCE}.`,
    },
    schema: [],
    messages: {
      reExportFromOtherPackage: `Re-exporting from ${FORBIDDEN_RE_EXPORT_SOURCE} is not allowed. Import this value directly from {{source}} instead.`,
    },
    type: 'suggestion',
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        checkReExport(context, node)
      },
      ExportAllDeclaration(node) {
        checkReExport(context, node)
      },
    }
  },
})

function checkReExport(context: RuleContext, node: TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration) {
  const source = node.source
  if (!source || typeof source.value !== 'string') {
    return
  }

  if (!source.value.startsWith(FORBIDDEN_RE_EXPORT_SOURCE)) {
    return
  }

  context.report({
    node: source,
    messageId: 'reExportFromOtherPackage',
    data: { source: source.value },
  })
}
