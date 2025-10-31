export default {
  meta: {
    docs: {
      description: 'Check command execution within nodejs scripts',
    },
    schema: [],
  },
  create(context) {
    return {
      'TaggedTemplateExpression[tag.name="command"]'(node) {
        if (!isCommandExecuted(node)) {
          context.report({
            node,
            message: 'Command is missing a `run()` call',
          })
        }

        if (isCommandContainsShellCharacters(node)) {
          context.report({
            node,
            message: "Command is containing shell characters. This is probably a mistake as it won't run in a shell.",
          })
        }
      },
    }
  },
}

function isCommandExecuted(node) {
  let methodCallNames = []
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
  while (currentMethodCall.type === 'MemberExpression' && currentMethodCall.parent.type === 'CallExpression') {
    methodCallNames.push(currentMethodCall.property.name)
    currentMethodCall = currentMethodCall.parent.parent
  }

  return methodCallNames.includes('run')
}

function isCommandContainsShellCharacters(node) {
  return node.quasi.quasis.some((quasi) => /[~\\$"'><(){}[\]]/.test(quasi.value.raw))
}
