'use strict'

const util = require('util')
const fs = require('fs')
const { readdirSync } = require('fs')
const readFile = util.promisify(require('fs').readFile)

const emojiNameMap = require('emoji-name-map')

const { browserSdkVersion } = require('../lib/browser-sdk-version')
const { spawnCommand, printError, runMain } = require('../lib/execution-utils')
const { command } = require('../lib/command')
const { modifyFile } = require('../lib/files-utils')

const CHANGELOG_FILE = 'CHANGELOG.md'
const CONTRIBUTING_FILE = 'CONTRIBUTING.md'
const PUBLIC_EMOJI_PRIORITY = ['💥', '✨', '🐛', '⚡', '📝']
const INTERNAL_EMOJI_PRIORITY = [
  '👷',
  '🔧',
  '📦', // build conf
  '♻️',
  '🎨', // refactoring
  '🧪',
  '✅', // tests
  '🔇',
  '🔊', // telemetry
  '👌',
  '📄',
  '⚗️', // experiment
]
const EMOJI_REGEX = /^\p{Emoji_Presentation}/u
const PACKAGES = readdirSync('packages').filter((name) => !name.endsWith('.DS_Store'))
const PACKAGES_REVERSE_DEPENDENCIES = new Map()

runMain(async () => {
  if (!process.env.EDITOR) {
    printError('Please configure your environment variable EDITOR')
    process.exit(1)
  }

  PACKAGES.forEach((pkg) => {
    for (const dependency of getDepenciesRecursively(pkg)) {
      if (!PACKAGES_REVERSE_DEPENDENCIES.has(dependency)) {
        PACKAGES_REVERSE_DEPENDENCIES.set(dependency, new Set())
      }
      PACKAGES_REVERSE_DEPENDENCIES.get(dependency).add(pkg)
    }
  })
  const emojisLegend = await getEmojisLegend()
  const changesList = getChangesList()

  await modifyFile(
    CHANGELOG_FILE,
    (content) => `\
# Changelog

${emojisLegend}

---

## v${browserSdkVersion}

${changesList}
${content.slice(content.indexOf('\n##'))}`
  )

  await spawnCommand(process.env.EDITOR, [CHANGELOG_FILE])

  command`yarn run prettier --write ${CHANGELOG_FILE}`.run()

  command`git add ${CHANGELOG_FILE}`.run()
})

async function getEmojisLegend() {
  const contributing = await readFile(CONTRIBUTING_FILE, { encoding: 'utf-8' })
  let collectLines = false

  const lines = ['> **Legend**']

  for (const line of contributing.split('\n')) {
    if (line.startsWith('### User-facing changes')) {
      collectLines = true
    } else if (collectLines) {
      if (line.startsWith('#')) {
        break
      } else if (line) {
        lines.push('>', `> ${line}`)
      }
    }
  }

  lines.push('>', '> See [Gitmoji](https://gitmoji.dev/) for a guide on the emojis used.')

  return lines.join('\n')
}

function getChangesList() {
  command`git fetch --tags -f -q`.run()
  const lastTagHash = command`git rev-list --tags --max-count=1`.run().trim()
  const lastTagName = command`git describe --tags ${lastTagHash}`.run()

  const commits = command`git log ${[`${lastTagName.trimEnd()}..HEAD`, '--pretty=format:%H %s']}`.run()
  const changesWithEmojis = emojiNameToUnicode(commits)

  let changes = changesWithEmojis.split('\n').filter(isNotVersionEntry)
  let internalChanges = []
  let publicChanges = []

  changes.forEach((entry) => {
    let trimmedEntry = entry.trim()
    const hash = trimmedEntry.split(' ')[0]
    const message = trimmedEntry.slice(trimmedEntry.indexOf(' ') + 1)
    const affectedPackages = getAffectedPackages(hash)

    const formattedPackages = affectedPackages.map((pkg) => `[${pkg.toUpperCase()}]`).join(' ')

    if (PUBLIC_EMOJI_PRIORITY.some((emoji) => message.startsWith(emoji))) {
      publicChanges.push(`${message} ${formattedPackages}`)
    } else {
      internalChanges.push(`${message} ${formattedPackages}`)
    }
  })

  const sortAndFormat = (entries, priority) =>
    entries.sort((a, b) => sortByEmojiPriority(a, b, priority)).map((entry) => `- ${entry}`)
  internalChanges = sortAndFormat(internalChanges, INTERNAL_EMOJI_PRIORITY)
  publicChanges = sortAndFormat(publicChanges, PUBLIC_EMOJI_PRIORITY)

  return `
**Public Changes:**

${publicChanges.join('\n')}

**Internal Changes:**

${internalChanges.join('\n')}
`.replace(/\(#(\d+)\)/gm, (_, id) => `([#${id}](https://github.com/DataDog/browser-sdk/pull/${id}))`)
}

function getAffectedPackages(hash) {
  const changedFiles = command`git diff-tree --no-commit-id --name-only -r ${hash}`.run().trim().split('\n')
  const affectedPackages = new Set()
  changedFiles.forEach((file) => {
    PACKAGES.forEach((pkg) => {
      if (file.startsWith(`packages/${pkg}`)) {
        if (PACKAGES_REVERSE_DEPENDENCIES.has(pkg)) {
          PACKAGES_REVERSE_DEPENDENCIES.get(pkg).forEach((dependentPkg) => {
            if (!PACKAGES_REVERSE_DEPENDENCIES.has(dependentPkg)) {
              affectedPackages.add(dependentPkg)
            }
          })
        } else {
          affectedPackages.add(pkg)
        }
      }
    })
  })
  return Array.from(affectedPackages)
}

function sortByEmojiPriority(a, b, priorityList) {
  const getFirstRelevantEmojiIndex = (text) => {
    const matches = text.match(EMOJI_REGEX) || []
    const emoji = matches.find((emoji) => priorityList.includes(emoji))
    return emoji ? priorityList.indexOf(emoji) : Number.MAX_VALUE
  }
  return getFirstRelevantEmojiIndex(a) - getFirstRelevantEmojiIndex(b)
}

function emojiNameToUnicode(changes) {
  const emojiNameRegex = new RegExp(/:[^:\s]*(?:::[^:\s]*)*:/, 'gm')
  return changes.replace(emojiNameRegex, (emoji) => emojiNameMap.get(emoji) || emoji)
}

function isNotVersionEntry(line) {
  return !/^v\d+\.\d+\.\d+/.test(line)
}

function getDepenciesRecursively(pkg) {
  const pkgJson = JSON.parse(fs.readFileSync(`packages/${pkg}/package.json`, { encoding: 'utf-8' }))
  const dependencies = new Set()
  if (pkgJson.dependencies) {
    for (let dependency of Object.keys(pkgJson.dependencies)) {
      dependency = dependency.substring(dependency.indexOf('-') + 1)
      dependencies.add(dependency)
      for (const transitiveDependency of getDepenciesRecursively(dependency)) {
        const coreTransitiveDependency = transitiveDependency.substring(dependency.indexOf('-') + 1)
        dependencies.add(coreTransitiveDependency)
      }
    }
  }
  return dependencies
}
