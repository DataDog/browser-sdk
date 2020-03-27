'use strict'

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

  const changesWithEmojis = await emojiNameToUnicode(
    `# Changelog\n\n## v${lernaConfig.version}\n\n${commitsCmd.stdout}`
  )

  try {
    await replace({
      files: CHANGELOG_FILE,
      from: new RegExp('# Changelog', 'g'),
      to: changesWithEmojis,
    })
  } catch (error) {
    throw error
  }

  const openEditorCmd = await spawn(process.env.EDITOR, [CHANGELOG_FILE], { stdio: 'inherit', detached: true })
  if (openEditorCmd.stderr) {
    throw openEditorCmd.stderr
  }
}

async function emojiNameToUnicode(changes) {
  const emojiNameRegex = /:[^:\s]*(?:::[^:\s]*)*:/g
  const changelogEmojisNames = new Map()

  const matches = emojiNameRegex.exec(changes)
  if (!!matches) {
    await matches.map((match) => {
      const emoji = name.get(match)
      if (!!emoji) {
        changelogEmojisNames.set(match, emoji)
      }
    })
  }

  for await (const [emojiName, emojiUnicode] of changelogEmojisNames) {
    changes = changes.replace(new RegExp(emojiName, 'g'), emojiUnicode)
  }

  return changes
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
