const fs = require('fs')
const path = require('path')
const fsPromises = require('fs/promises')

const { command } = require('./command')

const CI_FILE = '.gitlab-ci.yml'

function readCiFileVariable(variableName) {
  const regexp = new RegExp(`${variableName}: (.*)`)
  const ciFileContent = fs.readFileSync(CI_FILE, { encoding: 'utf-8' })
  return regexp.exec(ciFileContent)?.[1]
}

async function replaceCiFileVariable(variableName, value) {
  await modifyFile(CI_FILE, (content) =>
    content.replace(new RegExp(`${variableName}: .*`), `${variableName}: ${value}`)
  )
}

/**
 * @param filePath {string}
 * @param modifier {(content: string) => string | Promise<string>}
 */
async function modifyFile(filePath, modifier) {
  const content = await fsPromises.readFile(filePath, { encoding: 'utf-8' })
  const modifiedContent = await modifier(content)
  if (content !== modifiedContent) {
    await fsPromises.writeFile(filePath, modifiedContent)
    return true
  }
  return false
}

function findBrowserSdkPackageJsonFiles() {
  const manifestPaths = command`git ls-files -- package.json */package.json`.run()
  return manifestPaths
    .trim()
    .split('\n')
    .map((manifestPath) => {
      const absoluteManifestPath = path.join(__dirname, '../..', manifestPath)
      return {
        relativePath: manifestPath,
        path: absoluteManifestPath,
        content: require(absoluteManifestPath),
      }
    })
}

module.exports = {
  CI_FILE,
  readCiFileVariable,
  replaceCiFileVariable,
  modifyFile,
  findBrowserSdkPackageJsonFiles,
}
