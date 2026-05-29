import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Disallow importing spec file code to avoid to execute the tests from the imported spec file twice',
    },
    schema: [],
    messages: {
      noSpecImport: 'Members of a spec file must not be imported',
    },
    type: 'suggestion',
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === 'string' && isSpecFile(node.source.value)) {
          context.report({
            node: node.source,
            messageId: 'noSpecImport',
          })
        }
      },
    }
  },
})

function isSpecFile(filename: string) {
  return /\.spec(\.ts)?$/.test(filename)
}
