import { command } from '../../lib/command.ts'
import { fetchHandlingError } from '../../lib/executionUtils.ts'

const PR_COMMENT_HEADER = 'Bundles Sizes Evolution'
const PR_COMMENTER_AUTH_TOKEN = command`authanywhere --raw`.run()

export class PrComment {
  prNumber: number
  bundleSizesSection: string = 'Pending...'
  memoryPerformanceSection: string = 'Pending...'
  cpuPerformanceSection: string = 'Pending...'

  constructor(prNumber: number) {
    this.prNumber = prNumber
  }

  async setBundleSizes(newSection: string) {
    this.bundleSizesSection = newSection
    await this.updateComment()
  }

  async setMemoryPerformance(newSection: string) {
    this.memoryPerformanceSection = newSection
    await this.updateComment()
  }

  async setCpuPerformance(newSection: string) {
    this.cpuPerformanceSection = newSection
    await this.updateComment()
  }

  formatComment() {
    return `
${this.bundleSizesSection}

<details>
<summary>🚀 CPU Performance</summary>

${this.cpuPerformanceSection}

</details>

<details>
<summary>🧠 Memory Performance</summary>

${this.memoryPerformanceSection}

</details>

🔗 [RealWorld](https://datadoghq.dev/browser-sdk-test-playground/realworld-scenario/?prNumber=${this.prNumber})
`
  }

  async updateComment() {
    await updatePrComment(this.prNumber, this.formatComment())
  }
}

async function updatePrComment(prNumber: number, message: string): Promise<void> {
  const payload = {
    pr_url: `https://github.com/DataDog/browser-sdk/pull/${prNumber}`,
    message,
    header: PR_COMMENT_HEADER,
    org: 'DataDog',
    repo: 'browser-sdk',
  }
  await fetchHandlingError('https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${PR_COMMENTER_AUTH_TOKEN}`,
    },
    body: JSON.stringify(payload),
  })
}

interface MarkdownArrayOptions {
  headers: string[]
  rows: string[][]
}

export function markdownArray({ headers, rows }: MarkdownArrayOptions): string {
  let markdown = `| ${headers.join(' | ')} |\n| ${new Array(headers.length).fill('---').join(' | ')} |\n`
  rows.forEach((row) => {
    markdown += `| ${row.join(' | ')} |\n`
  })
  return markdown
}
