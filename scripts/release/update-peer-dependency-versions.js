const lernaConfig = require('../../lerna.json')
const { runMain } = require('../lib/execution-utils')
const { modifyFile } = require('../lib/files-utils')

const JSON_FILES = ['rum', 'rum-slim', 'logs'].map((packageName) => `./packages/${packageName}/package.json`)
const YAML_FILES = ['yarn.lock']

// This script updates the peer dependency versions between rum and logs packages to match the new
// version during a release.
//
// Lerna [intentionally removed support for it][1], and [closed a feature request asking for an
// option to bump them on publish][2], but we still want to make sure this version is updated as
// well to warn users who use different versions of RUM and Logs packages.
//
// [1]: https://github.com/lerna/lerna/commit/bdbfc62966e5351abfeac77830f9d47b6d69f1b1
// [2]: https://github.com/lerna/lerna/issues/1575
runMain(async () => {
  for (const jsonFile of JSON_FILES) {
    await modifyFile(jsonFile, updateJsonPeerDependencies)
  }
  for (const yamlFile of YAML_FILES) {
    await modifyFile(yamlFile, updateYamlPeerDependencies)
  }
})
function updateJsonPeerDependencies(content) {
  const json = JSON.parse(content)
  Object.keys(json.peerDependencies).forEach((key) => {
    json.peerDependencies[key] = lernaConfig.version
  })
  return `${JSON.stringify(json, null, 2)}\n`
}

function updateYamlPeerDependencies(content) {
  return content.replaceAll(/(peerDependencies:\s+"@datadog\/[^"]+":\s)[\d.]+/g, `$1${lernaConfig.version}`)
}
