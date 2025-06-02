const { command } = require('../../lib/command')
const { fetchHandlingError, printError, printLog } = require('../../lib/executionUtils')
const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere --raw`.run()
const LOCAL_COMMIT_SHA = process.env.CI_COMMIT_SHORT_SHA

const BUNDLE_SIZES_PLACEHOLDER = 'Waiting for bundle sizes...'
const CPU_PERFORMANCE_PLACEHOLDER = 'Waiting for CPU performance...'
const MEMORY_BASE_PERFORMANCE_PLACEHOLDER = 'Waiting for memory base performance...'

function reportAsPrComment(pr) {
  let message = `
${BUNDLE_SIZES_PLACEHOLDER}
${CPU_PERFORMANCE_PLACEHOLDER}
${MEMORY_BASE_PERFORMANCE_PLACEHOLDER}

🔗 [RealWorld](https://datadoghq.dev/browser-sdk-test-playground/realworld-scenario/?prNumber=${pr.number})
`

  updateOrAddComment(message, pr.number)

  return {
    setBundleSizesMessage(bundleSizesMessage) {
      message = message.replace(BUNDLE_SIZES_PLACEHOLDER, bundleSizesMessage)
      updateOrAddComment(message, pr.number)
    },
    setCpuPerformanceMessage(cpuPerformanceMessage) {
      message = message.replace(CPU_PERFORMANCE_PLACEHOLDER, cpuPerformanceMessage)
      updateOrAddComment(message, pr.number)
    },
    setMemoryPerformanceMessage(memoryBasePerformanceMessage) {
      message = message.replace(MEMORY_BASE_PERFORMANCE_PLACEHOLDER, memoryBasePerformanceMessage)
      updateOrAddComment(message, pr.number)
    },
  }
}

function updateOrAddComment(message, prNumber) {
  printLog(`Updating PR comment for PR #${prNumber}`)
  const payload = {
    pr_url: `https://github.com/DataDog/browser-sdk/pull/${prNumber}`,
    message,
    header: PR_COMMENT_HEADER,
    org: 'DataDog',
    repo: 'browser-sdk',
  }

  fetchHandlingError('https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PR_COMMENTER_AUTH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    printError('Failed to update:', error)
  })
}

module.exports = {
  LOCAL_COMMIT_SHA,
  reportAsPrComment,
}
