import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'
import { minimatch } from 'minimatch'

type MessageIds = 'reExportFromOtherPackage'
type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>

// Re-exporting from @datadog/js-core makes it look like the value belongs to the
// re-exporting package. Consumers should import it from @datadog/js-core directly.
const FORBIDDEN_RE_EXPORT_SOURCE = '@datadog/js-core'

type Options = readonly [
  {
    allowEntryFiles?: readonly string[]
  }?,
]

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: `Disallow re-exporting values from ${FORBIDDEN_RE_EXPORT_SOURCE}.`,
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowEntryFiles: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      reExportFromOtherPackage: `Re-exporting from ${FORBIDDEN_RE_EXPORT_SOURCE} is not allowed. Import this value directly from {{source}} instead.`,
    },
    type: 'suggestion',
  },
  create(context) {
    const options = context.options as Options
    const allowEntryFiles = options[0]?.allowEntryFiles ?? []

    return {
      ExportNamedDeclaration(node) {
        checkReExport(context, node, allowEntryFiles)
      },
      ExportAllDeclaration(node) {
        checkReExport(context, node, allowEntryFiles)
      },
    }
  },
})

function checkReExport(
  context: RuleContext,
  node: TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration,
  allowEntryFiles: readonly string[]
) {
  const source = node.source
  if (!source || typeof source.value !== 'string') {
    return
  }

  if (!source.value.startsWith(FORBIDDEN_RE_EXPORT_SOURCE)) {
    return
  }

  // Customer-facing package entry points are allowed to re-export from @datadog/js-core
  // to preserve the public API of published packages.
  if (allowEntryFiles.some((glob) => minimatch(context.filename, glob))) {
    return
  }

  context.report({
    node: source,
    messageId: 'reExportFromOtherPackage',
    data: { source: source.value },
  })
}
