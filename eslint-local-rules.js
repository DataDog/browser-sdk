/* eslint-disable unicorn/filename-case */
const path = require('path')

module.exports = {
  'enforce-declarative-modules': {
    meta: {
      docs: {
        description: 'Disallow potential side effects in types, constants and internal files',
        recommended: false,
      },
      schema: [],
    },
    create(context) {
      const filename = path.basename(context.getFilename())
      const dotIndex = filename.lastIndexOf('.')
      const filenameWithoutExtension = dotIndex < 0 ? filename : filename.slice(0, dotIndex)
      if (!isRestrictedFile(filenameWithoutExtension)) {
        return {}
      }
      return {
        Program(node) {
          node.body.forEach((child) => {
            reportRestrictedDeclarations(context, child)
          })
        },
      }
    },
  },
}

function isRestrictedFile(filenameWithoutExtension) {
  return (
    filenameWithoutExtension === 'types' ||
    filenameWithoutExtension === 'internal' ||
    filenameWithoutExtension === 'constants' ||
    filenameWithoutExtension.endsWith('.constants') ||
    filenameWithoutExtension.endsWith('.types')
  )
}

function reportRestrictedDeclarations(context, node) {
  switch (node.type) {
    case 'TemplateLiteral':
      node.expressions.forEach((child) => reportRestrictedDeclarations(context, child))
      break
    case 'ExportNamedDeclaration':
    case 'ExportAllDeclaration':
    case 'ImportDeclaration':
      if (node.declaration) {
        reportRestrictedDeclarations(context, node.declaration)
      } else if (node.source && !isRestrictedFile(path.basename(node.source.value))) {
        context.report({
          node: node.source,
          message: `This file can only import types, constants and internal files`,
        })
      }
      break
    case 'VariableDeclaration':
      node.declarations.forEach((child) => reportRestrictedDeclarations(context, child))
      break
    case 'VariableDeclarator':
      if (node.init) {
        reportRestrictedDeclarations(context, node.init)
      }
      break
    case 'ArrayExpression':
      node.elements.forEach((child) => reportRestrictedDeclarations(context, child))
      break
    case 'UnaryExpression':
      reportRestrictedDeclarations(context, node.argument)
      break
    case 'ObjectExpression':
      node.properties.forEach((child) => reportRestrictedDeclarations(context, child))
      break
    case 'SpreadElement':
      reportRestrictedDeclarations(context, node.argument)
      break
    case 'Property':
      reportRestrictedDeclarations(context, node.key)
      reportRestrictedDeclarations(context, node.value)
      break
    case 'AssignmentExpression':
    case 'BinaryExpression':
      reportRestrictedDeclarations(context, node.left)
      reportRestrictedDeclarations(context, node.right)
      break
    case 'TSAsExpression':
    case 'ExpressionStatement':
      reportRestrictedDeclarations(context, node.expression)
      break
    case 'MemberExpression':
      reportRestrictedDeclarations(context, node.object)
      reportRestrictedDeclarations(context, node.property)
      break
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSDeclareFunction':
    case 'Literal':
    case 'Identifier':
      break
    default:
      context.report({ node, message: `${node.type} not allowed in types, constants and internal files` })
      break
  }
}
