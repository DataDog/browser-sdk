'use strict'

const replace = require('replace-in-file')
const util = require('util')
const exec = util.promisify(require('child_process').exec)
const spawn = util.promisify(require('child_process').spawn)

const name = require('emoji-name-map')

const lernaConfig = require('../lerna.json')

const CHANGELOG_FILE = 'CHANGELOG.md'

async function main() {
  const lastTagHashCmd = await exec('git rev-list --tags --max-count=1')
  if (lastTagHashCmd.stderr) {
    throw lastTagHashCmd.stderr
  }

  const lastTagNameCmd = await exec(`git describe --tags ${lastTagHashCmd.stdout}`)
  if (lastTagNameCmd.stderr) {
    throw lastTagNameCmd.stderr
  }
  const oldTag = lastTagNameCmd.stdout.replace(/\n$/, '')

  const commitsCmd = await exec(`git log ${oldTag}..HEAD --pretty=format:"- %s"`)
  if (commitsCmd.stderr) {
    throw commitsCmd.stderr
  }

  const changesWithEmojis = await emojiNameToUnicode(
    `# Changelog\n\n## v${lernaConfig.version}\n\n${commitsCmd.stdout}`
  )

  const changesWhihPullRequestLinks = changesWithEmojis.replace(
    /\(#(\d+)\)/gm,
    (match, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`
  )

  await replace({
    files: CHANGELOG_FILE,
    from: new RegExp('# Changelog', 'g'),
    to: changesWhihPullRequestLinks,
  })

  const openEditorCmd = await spawn(process.env.EDITOR, [CHANGELOG_FILE], { stdio: 'inherit', detached: true })
  if (openEditorCmd.stderr) {
    throw openEditorCmd.stderr
  }
}

async function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')

  let matches
  while ((matches = emojiNameRegex.exec(changes))) {
    if (!!matches) {
      await matches.map((match) => {
        changes = changes.replace(match, name.get(match) || match)
      })
    }
  }

  return changes
}

main().catch((e) => {
  console.error('\nStacktrace:\n', e)
  process.exit(1)
})
