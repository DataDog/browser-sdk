import type { TSESLint, TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

type MessageIds = 'testCodeImportOrExport'
type RuleContext = Readonly<TSESLint.RuleContext<MessageIds, readonly unknown[]>>

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description:
        'Disallow importing or exporting test code in src code to avoid bloating customer package with test code',
    },
    schema: [],
    messages: {
      testCodeImportOrExport: 'Test code import or export is not allowed in src code',
    },
    type: 'suggestion',
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
      ExportNamedDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
      ExportAllDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
    }
  },
})

function checkTestImportExportFromSrc(
  context: RuleContext,
  node: TSESTree.ImportDeclaration | TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration
) {
  if (
    !isTestCode(context.filename) &&
    node.source &&
    typeof node.source.value === 'string' &&
    isTestCode(node.source.value)
  ) {
    context.report({
      node: node.source,
      messageId: 'testCodeImportOrExport',
    })
  }
}

function isTestCode(filename: string) {
  return /(\/test|\.specHelper|\.spec)/.test(filename)
}
