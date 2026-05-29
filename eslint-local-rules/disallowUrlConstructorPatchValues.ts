import { AST_NODE_TYPES } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Disallow problematic URL constructor patched values.',
    },
    schema: [],
    messages: {
      patchedUrlConstructor: 'This value might be patched. Use `buildUrl` from @datadog/browser-core instead',
    },
    type: 'suggestion',
  },

  create(context) {
    return {
      'Program:exit'(node) {
        const globalScope = context.sourceCode.getScope(node)
        const variable = globalScope.set.get('URL')

        if (variable && variable.defs.length === 0) {
          variable.references.forEach((ref) => {
            const idNode = ref.identifier
            const parent = idNode.parent

            if (parent && parent.type === AST_NODE_TYPES.NewExpression && parent.callee === idNode) {
              context.report({
                node: idNode,
                messageId: 'patchedUrlConstructor',
              })
            }
          })
        }
      },
    }
  },
})
