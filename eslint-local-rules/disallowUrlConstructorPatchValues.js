module.exports = {
  meta: {
    docs: {
      description: 'Disallow problematic URL constructor patched values.',
      recommended: false,
    },
    schema: [],
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

            if (parent && parent.type === 'NewExpression' && parent.callee === idNode) {
              context.report(idNode, 'This value might be patched. Use `buildUrl` from @flashcatcloud/browser-core instead')
            }
          })
        }
      },
    }
  },
}
