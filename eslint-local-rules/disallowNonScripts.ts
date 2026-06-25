import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'
import { AST_NODE_TYPES } from '@typescript-eslint/utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Disallow JS files that are not used as a "script"',
    },
    schema: [],
    messages: {
      missingRunMain: 'This file should be a script and contain a `runMain()` expression',
    },
    type: 'suggestion',
  },
  create: (context) => ({
    Program: (node) => {
      // Find if there is a `runMain()` expression at the top level
      const hasRunMainAtTopLevel = node.body.some(
        (n) =>
          n.type === AST_NODE_TYPES.ExpressionStatement &&
          n.expression.type === AST_NODE_TYPES.CallExpression &&
          n.expression.callee.type === AST_NODE_TYPES.Identifier &&
          n.expression.callee.name === 'runMain'
      )

      // Check if the file has `if (!process.env.NODE_TEST_CONTEXT)` wrapping `runMain()`
      const hasRequireMainCheck = node.body.some(
        (n) =>
          n.type === AST_NODE_TYPES.IfStatement &&
          n.test.type === AST_NODE_TYPES.UnaryExpression &&
          n.test.operator === '!' &&
          n.test.argument.type === AST_NODE_TYPES.MemberExpression &&
          n.test.argument.object.type === AST_NODE_TYPES.MemberExpression &&
          n.test.argument.object.object.type === AST_NODE_TYPES.Identifier &&
          n.test.argument.object.object.name === 'process' &&
          n.test.argument.object.property.type === AST_NODE_TYPES.Identifier &&
          n.test.argument.object.property.name === 'env' &&
          n.test.argument.property.type === AST_NODE_TYPES.Identifier &&
          n.test.argument.property.name === 'NODE_TEST_CONTEXT' &&
          n.consequent.type === AST_NODE_TYPES.BlockStatement &&
          n.consequent.body.some(
            (innerNode) =>
              innerNode.type === AST_NODE_TYPES.ExpressionStatement &&
              innerNode.expression.type === AST_NODE_TYPES.CallExpression &&
              innerNode.expression.callee.type === AST_NODE_TYPES.Identifier &&
              innerNode.expression.callee.name === 'runMain'
          )
      )

      if (!hasRunMainAtTopLevel && !hasRequireMainCheck) {
        context.report({
          node,
          messageId: 'missingRunMain',
        })
      }
    },
  }),
})
