module.exports = {
  meta: {
    docs: {
      description:
        'Disallow importing or exporting test code in src code to avoid bloating customer package with test code',
      recommended: false,
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
      ExportNamedDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
      ExportAllDeclaration(node) {
        checkTestImportExportFromSrc(context, node)
      },
    }
  },
}

function checkTestImportExportFromSrc(context, node) {
  if (!isTestCode(context.filename) && node.source && isTestCode(node.source.value)) {
    context.report({
      node: node.source,
      message: 'Test code import or export is not allowed in src code',
    })
  }
}

function isTestCode(filename) {
  return /(\/test|\.specHelper|\.spec)/.test(filename)
}
