'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const replace = require('replace-in-file')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const spawn = util.promisify(require('child_process').spawn)

const name = require('emoji-name-map')

const lernaConfig = require('../lerna.json')

const CHANGELOG_FILE = 'CHANGELOG.md'

async function main() {
  const lastHashCmd = await exec('git rev-list --tags --max-count=1')
  if (lastHashCmd.stderr) {
    throw lastHashCmd.stderr
  }

  const oldTagCmd = await exec(`git describe --tags ${lastHashCmd.stdout}`)
  if (oldTagCmd.stderr) {
    throw oldTagCmd.stderr
  }
  const oldTag = oldTagCmd.stdout.replace(/\n$/, '')

  const commitsCmd = await exec(`git log ${oldTag}..HEAD --pretty=format:"- %s"`)
  if (commitsCmd.stderr) {
    throw commitsCmd.stderr
  }

  try {
    await replace({
      files: CHANGELOG_FILE,
      from: new RegExp('# Changelog', 'g'),
      to: `# Changelog\n\n## v${lernaConfig.version}\n\n${commitsCmd.stdout}`,
    })
  } catch (error) {
    throw error
  }

  await emojiNameToUnicode()

  const openEditorCmd = await spawn(process.env.EDITOR, [CHANGELOG_FILE], { stdio: 'inherit', detached: true })
  if (openEditorCmd.stderr) {
    throw openEditorCmd.stderr
  }
}

async function emojiNameToUnicode() {
  const fileStream = fs.createReadStream(path.join(__dirname, '..', CHANGELOG_FILE))
  const rl = readline.createInterface({ input: fileStream })
  const emojiNameRegex = /:[^:\s]*(?:::[^:\s]*)*:/g
  const changelogEmojisNames = new Map()

  for await (const line of rl) {
    const matches = emojiNameRegex.exec(line)
    if (!!matches) {
      await matches.map((match) => {
        const emoji = name.get(match)
        if (!!emoji) {
          changelogEmojisNames.set(match, emoji)
        }
      })
    }
  }

  for await (const [emojiName, emojiUnicode] of changelogEmojisNames) {
    try {
      await replace({
        files: CHANGELOG_FILE,
        from: new RegExp(emojiName, 'g'),
        to: emojiUnicode,
      })
    } catch (error) {
      console.error('Error occurred:', error)
    }
  }
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
