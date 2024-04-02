const fs = require('fs').promises
const path = require('path')
const { command } = require('../../lib/command')
const { getOrg2ApiKey, getOrg2AppKey } = require('../../lib/secrets')
const filePath = path.join(__dirname, '../../../datadog-ci.synthetics.json')
const apiKey = getOrg2ApiKey()
const appKey = getOrg2AppKey()

async function updateStartUrl(prNumber) {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const json = JSON.parse(data)
    json.tests[0].config.startUrl += prNumber
    await fs.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8')
  } catch (err) {
    console.error('Error:', err)
  }
}

function syntheticTrigger() {
  command`datadog-ci synthetics run-tests --apiKey ${apiKey} --appKey ${appKey} --files ${filePath}`.run()
}

module.exports = {
  syntheticTrigger,
  updateStartUrl,
}
