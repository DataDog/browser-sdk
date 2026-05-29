import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils'
import { RuleCreator } from '@typescript-eslint/utils/eslint-utils'

export default RuleCreator.withoutDocs({
  meta: {
    docs: {
      description: 'Check command execution within nodejs scripts',
    },
    schema: [],
    messages: {
      missingRunCall: 'Command is missing a `run()` call',
      shellCharacters: "Command is containing shell characters. This is probably a mistake as it won't run in a shell.",
    },
    type: 'suggestion',
  },
  create(context) {
    return {
      'TaggedTemplateExpression[tag.name="command"]'(node) {
        if (!isCommandExecuted(node)) {
          context.report({
            node,
            messageId: 'missingRunCall',
          })
        }

        if (isCommandContainsShellCharacters(node)) {
          context.report({
            node,
            messageId: 'shellCharacters',
          })
        }
      },
    }
  },
})

function isCommandExecuted(node: TSESTree.TaggedTemplateExpression) {
  const methodCallNames: string[] = []
  let currentMethodCall = node.parent

  // Iterate over the builder pattern method calls. For the expression "`foo`.bar().baz()" AST looks
  // like this:
  //
  //                         CallExpression
  //                          | callee
  //                         MemberExpression
  //                         / object      \ property
  //                       CallExpression  Identifier (baz)
  //                        | callee
  //                       MemberExpression
  //                       / object     \ property
  // TaggedTemplateExpression (`foo`)   Identifier (bar)
  //
  // From the TaggedTemplateExpression node, we need to recurse on parents, getting method call
  // names stored in member expression property identifiers.
  while (
    currentMethodCall.type === AST_NODE_TYPES.MemberExpression &&
    currentMethodCall.parent.type === AST_NODE_TYPES.CallExpression
  ) {
    if (currentMethodCall.property.type === AST_NODE_TYPES.Identifier) {
      methodCallNames.push(currentMethodCall.property.name)
    }
    currentMethodCall = currentMethodCall.parent.parent
  }

  return methodCallNames.includes('run') || methodCallNames.includes('runAsync')
}

function isCommandContainsShellCharacters(node: TSESTree.TaggedTemplateExpression) {
  return node.quasi.quasis.some((quasi) => /[~\\$"'><(){}[\]]/.test(quasi.value.raw))
}
