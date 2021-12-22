const resolve = require('eslint-module-utils/resolve').default
const moduleVisitor = require('eslint-module-utils/moduleVisitor').default
const importType = require('eslint-plugin-import/lib/core/importType').default

module.exports = {
  meta: {
    docs: {
      description:
        'Consider directories containing an "index" file as protected, and disallow importing modules from them.',
    },
    schema: [],
  },
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

    // look for a directory higher in the hierarchy first
    const parentProtectedDirectory = findProtectedDirectory(parentPotentialProtectedDirectory)
    if (parentProtectedDirectory) {
      return parentProtectedDirectory
    }

    // If we can import directly from the directory, it means that it contains an 'index' file.
    // Consider it protected.
    if (resolve(potentialProtectedDirectory, context)) {
      return potentialProtectedDirectory
    }
  }
}

function splitLast(importSource) {
  const lastIndex = importSource.lastIndexOf('/')
  if (lastIndex < 0) {
    return ['', importSource]
  }
  return [importSource.slice(0, lastIndex), importSource.slice(lastIndex + 1)]
}
