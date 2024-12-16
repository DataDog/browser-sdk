module.exports = {
  meta: {
    docs: {
      description: 'Disallow JS files that are not used as a "script"',
    },
    schema: [],
  },
  create: (context) => ({
    Program: (node) => {
      // Find if there is a `runMain()` expression at the top level
      const hasRunMainAtTopLevel = node.body.some(
        (n) =>
          n.type === 'ExpressionStatement' &&
          n.expression.type === 'CallExpression' &&
          n.expression.callee.name === 'runMain'
      )

      // Check if the file has `if (require.main === module)` wrapping `runMain()`
      const hasRequireMainCheck = node.body.some(
        (n) =>
          n.type === 'IfStatement' &&
          n.test.type === 'BinaryExpression' &&
          n.test.operator === '===' &&
          n.test.left.type === 'MemberExpression' &&
          n.test.left.object.name === 'require' &&
          n.test.left.property.name === 'main' &&
          n.test.right.type === 'Identifier' &&
          n.test.right.name === 'module' &&
          n.consequent.body.some(
            (innerNode) =>
              innerNode.type === 'ExpressionStatement' &&
              innerNode.expression.type === 'CallExpression' &&
              innerNode.expression.callee.name === 'runMain'
          )
      )

      if (!hasRunMainAtTopLevel && !hasRequireMainCheck) {
        context.report({
          node,
          message: 'This file should be a script and contain a `runMain()` expression',
        })
      }
    },
  }),
}
