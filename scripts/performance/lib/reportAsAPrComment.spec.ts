import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { Pr } from './reportAsAPrComment.ts'

describe('PrComment', () => {
  it('should send a comment with performance results', async () => {
    const fetchMock = mock.method(globalThis, 'fetch')
    fetchMock.mock.mockImplementation(() => Promise.resolve({ ok: true } as Response))

    const pr = new Pr(123, 'abc')

    await pr.setBundleSizes('RUM: 10KB')

    const [url, options] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'https://pr-commenter.us1.ddbuild.io/internal/cit/pr-comment')

    const { body } = options as RequestInit
    const payload = JSON.parse(body as string)
    assert.equal(payload.pr_url, 'https://github.com/DataDog/browser-sdk/pull/123')
    assert.equal(payload.header, 'Bundles Sizes Evolution')
    assert.equal(payload.org, 'DataDog')
    assert.equal(payload.repo, 'browser-sdk')
    assert.equal(
      payload.message,
      `
RUM: 10KB

<details>
<summary>🚀 CPU Performance</summary>

Pending...

</details>

<details>
<summary>🧠 Memory Performance</summary>

Pending...

</details>

🔗 [RealWorld](https://datadoghq.dev/browser-sdk-test-playground/realworld-scenario/?prNumber=123)
`
    )
  })
})
