module.exports = {
  meta: {
    docs: {
      description: 'Disallow JS files that are not used as a "script"',
    },
    schema: [],
  },
  create: (context) => ({
    Program: (node) => {
      if (!node.body.some(isMain)) {
        context.report({
          node,
          message: 'This file should be a script and contain a `runMain()` expression',
        })
      }
    },
  }),
}

/**
 * Check if the node is like `runMain(fn)`
 */
function isMain(node) {
  return (
    node.type === 'ExpressionStatement' &&
    node.expression.type === 'CallExpression' &&
    node.expression.callee.name === 'runMain'
  )
}
