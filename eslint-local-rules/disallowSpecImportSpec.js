module.exports = {
  meta: {
    docs: {
      description:
        // eslint-disable-next-line max-len
        'Disallow importing spec file code inside a spec file, it would execute the tests from the imported spec file twice',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    if (!isSpecFile(context.getFilename())) {
      return {}
    }
    return {
      Program(node) {
        reportSpecImportSpec(context, node)
      },
    }
  },
}

function isSpecFile(filename) {
  return /\.spec(\.ts)?$/.test(filename)
}

function reportSpecImportSpec(context, node) {
  if (node.type === 'Program') {
    node.body.forEach((child) => reportSpecImportSpec(context, child))
  } else if (node.type === 'ImportDeclaration' && isSpecFile(node.source.value)) {
    context.report({
      node: node.source,
      message: 'A spec file must not import members of another spec file',
    })
  }
}
