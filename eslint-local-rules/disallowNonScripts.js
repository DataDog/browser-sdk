export default {
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

      // Check if the file has `if (!process.env.NODE_TEST_CONTEXT)` wrapping `runMain()`
      const hasRequireMainCheck = node.body.some(
        (n) =>
          n.type === 'IfStatement' &&
          n.test.type === 'UnaryExpression' &&
          n.test.operator === '!' &&
          n.test.argument.type === 'MemberExpression' &&
          n.test.argument.object.type === 'MemberExpression' &&
          n.test.argument.object.object.name === 'process' &&
          n.test.argument.object.property.name === 'env' &&
          n.test.argument.property.name === 'NODE_TEST_CONTEXT' &&
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
