import { parseArgs } from 'node:util'
import { GitHub, Manifest } from 'release-please'
import type { CandidateRelease } from 'release-please'
import releasePleaseConfig from '../../release-please-config.json' with { type: 'json' }
import { command } from '../lib/command.ts'
import { printLog, runMain } from '../lib/executionUtils.ts'
import { getGithubReleasePleaseToken } from '../lib/secrets.ts'

const OWNER = 'DataDog'
const REPO = 'browser-sdk'
const ROOT_PATH = '.'
// Passed as an argument: `command` doesn't use a shell, so the glob reaches `git describe --match` as is.
const RELEASE_TAG_PATTERN = 'v[0-9]*'
const CONVENTIONAL_COMMIT_REGEX = /^(?<type>[a-z]+)(\([^()]*\))?!?: /

export interface GitCommit {
  sha: string
  subject: string
}

if (!process.env.NODE_TEST_CONTEXT) {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      'target-branch': { type: 'string', default: 'main' },
    },
  })
  runMain(() => main({ dryRun: values['dry-run'], targetBranch: values['target-branch'] }))
}

/**
 * Tag and draft-release a merged release pull request, then open or update the next one.
 *
 * With `--dry-run`, only print what would be released and proposed, using the local `gh` token.
 */
export async function main({ dryRun, targetBranch }: { dryRun: boolean; targetBranch: string }): Promise<void> {
  using token = dryRun ? getLocalToken() : getGithubReleasePleaseToken()
  const github = await GitHub.create({ owner: OWNER, repo: REPO, token: token.value, defaultBranch: targetBranch })

  const releaseManifest = await Manifest.fromManifest(github, targetBranch)
  const releases = await releaseManifest.buildReleases()
  for (const release of releases) {
    printLog(`Release ${release.tag.toString()} at ${release.sha} (#${release.pullRequest.number})`)
    if (release.path === ROOT_PATH) {
      checkReleaseNotesAreComplete(release)
    }
  }

  if (dryRun) {
    for (const release of releases) {
      printLog(`--- notes for ${release.tag.toString()}\n${release.notes}`)
    }
    const pullRequests = await (await Manifest.fromManifest(github, targetBranch)).buildPullRequests()
    for (const pullRequest of pullRequests) {
      printLog(`Release pull request "${pullRequest.title.toString()}" on ${pullRequest.headRefName}`)
      printLog(`  updates: ${pullRequest.updates.map((update) => update.path).join(', ')}`)
      printLog(`--- body\n${pullRequest.body.toString()}`)
    }
    return
  }

  if (releases.length > 0) {
    await releaseManifest.createReleases()
  }
  // A fresh manifest, so the next release pull request starts from the release just created.
  await (await Manifest.fromManifest(github, targetBranch)).createPullRequests()
}

/**
 * The release pull request is refreshed by this job on every push to main. If it is merged right
 * after another pull request, before the job refreshed it, that other change would be released
 * without a changelog entry. Refuse to tag in that case.
 */
function checkReleaseNotesAreComplete(release: CandidateRelease): void {
  const previousRelease = findPreviousReleaseSha(release.sha)
  const commits = getCommits(`${previousRelease}..${release.sha}^`)
  const missingCommits = findMissingCommits(release.notes, commits, getVisibleTypes())

  if (missingCommits.length > 0) {
    throw new Error(
      `Release pull request #${release.pullRequest.number} was merged before listing these commits:\n` +
        `${missingCommits.map(({ sha, subject }) => `  ${sha.slice(0, 7)} ${subject}`).join('\n')}\n` +
        `No tag was created. Add the missing entries to the release notes in #${release.pullRequest.number}'s ` +
        'description and to CHANGELOG.md (follow-up PR), then retry this job.'
    )
  }
}

/**
 * The previous Browser SDK release: the closest `vX.Y.Z` tag on main, or `last-release-sha` before
 * the first release made by release-please (legacy tags are not on main).
 */
function findPreviousReleaseSha(releaseSha: string): string {
  const lastReleaseSha = releasePleaseConfig['last-release-sha']
  let tag: string
  try {
    tag = command`git describe --tags --abbrev=0 --match ${RELEASE_TAG_PATTERN} ${releaseSha}^`.run().trim()
  } catch {
    return lastReleaseSha // no release tag on main yet
  }
  const tagSha = command`git rev-list -n 1 ${tag}`.run().trim()
  return isAncestor(lastReleaseSha, tagSha) ? tagSha : lastReleaseSha
}

function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    command`git merge-base --is-ancestor ${ancestor} ${descendant}`.run()
    return true
  } catch {
    return false
  }
}

function getCommits(range: string): GitCommit[] {
  return command`git log --format=%H%x09%s ${range}`
    .run()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, ...subject] = line.split('\t')
      return { sha, subject: subject.join('\t') }
    })
}

/** Types listed in a visible changelog section: release-please adds an entry for each such commit. */
export function getVisibleTypes(
  config: { 'changelog-sections': Array<{ type: string; hidden?: boolean }> } = releasePleaseConfig
): Set<string> {
  return new Set(config['changelog-sections'].filter(({ hidden }) => !hidden).map(({ type }) => type))
}

/**
 * Find the Conventional Commits of a visible type whose sha is not linked from the release notes.
 * Other commits (legacy gitmoji titles, hidden types) never get a changelog entry, so they are
 * only logged.
 */
export function findMissingCommits(notes: string, commits: GitCommit[], visibleTypes: Set<string>): GitCommit[] {
  const missingCommits: GitCommit[] = []
  for (const commit of commits) {
    const type = CONVENTIONAL_COMMIT_REGEX.exec(commit.subject)?.groups?.type
    if (!type || !visibleTypes.has(type)) {
      printLog(`Not expected in the changelog: ${commit.sha.slice(0, 7)} ${commit.subject}`)
      continue
    }
    if (!notes.includes(commit.sha)) {
      missingCommits.push(commit)
    }
  }
  return missingCommits
}

function getLocalToken(): { value: string } & Disposable {
  return {
    value: process.env.GITHUB_TOKEN ?? command`gh auth token`.run().trim(),
    [Symbol.dispose]: () => undefined, // nothing to revoke
  }
}
