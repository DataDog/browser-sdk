'use strict'

const fs = require('fs')
const path = require('path')
const readline = require('readline')
const name = require('emoji-name-map')
const replace = require('replace-in-file')

const CHANGELOG_FILE = 'CHANGELOG.md'

async function main() {
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
