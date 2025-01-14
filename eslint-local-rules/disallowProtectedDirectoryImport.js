const path = require('path')
const { minimatch } = require('minimatch')
const resolve = require('eslint-module-utils/resolve').default
const moduleVisitor = require('eslint-module-utils/moduleVisitor').default
const importType = require('eslint-plugin-import/lib/core/importType').default

module.exports = {
  meta: {
    docs: {
      description:
        'Consider directories containing an "index" file as protected, and disallow importing modules from them.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignore: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  /**
   * @returns {Record<string, Function>}
   */
  create(context) {
    return moduleVisitor((source) => {
      const protectedDirectory = getFirstProtectedDirectory(source.value, context)
      if (protectedDirectory) {
        context.report(source, `${protectedDirectory} is a protected directory, import from its index module instead`)
      }
    })
  },
}

function getFirstProtectedDirectory(importedModule, context) {
  // only consider relative and absolute paths, no package or builtin imports
  if (!['absolute', 'sibling', 'index', 'parent'].includes(importType(importedModule, context))) {
    return
  }

  // only consider imports that can be resolved
  if (!resolve(importedModule, context)) {
    return
  }

  return findProtectedDirectory(splitLast(importedModule)[0])

  function findProtectedDirectory(potentialProtectedDirectory) {
    const [parentPotentialProtectedDirectory, basename] = splitLast(potentialProtectedDirectory)
    if (basename === '' || basename === '..' || basename === '.') {
      return
    }

    // Look for a directory higher in the hierarchy first
    const parentProtectedDirectory = findProtectedDirectory(parentPotentialProtectedDirectory)
    if (parentProtectedDirectory) {
      return parentProtectedDirectory
    }

    // If we can import an index file within the directory, consider it protected.
    const resolvedPath = resolve(`${potentialProtectedDirectory}/index`, context)
    if (!resolvedPath) {
      return
    }

    // Make sure we shouldn't ignore it
    const resolvedPathRelativeToCwd = path.relative(context.getCwd(), resolvedPath)
    const shouldIgnore = context.options[0]?.ignore?.some((glob) => minimatch(resolvedPathRelativeToCwd, glob))
    if (shouldIgnore) {
      return
    }

    return potentialProtectedDirectory
  }
}

function splitLast(importSource) {
  const lastIndex = importSource.lastIndexOf('/')
  if (lastIndex < 0) {
    return ['', importSource]
  }
  return [importSource.slice(0, lastIndex), importSource.slice(lastIndex + 1)]
}
