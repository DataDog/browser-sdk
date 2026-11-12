import assert from 'node:assert/strict'
import path from 'node:path'
import { before, beforeEach, describe, it, mock } from 'node:test'
import { mockModule } from './lib/testHelpers.ts'

const RUN_URL = 'https://github.com/DataDog/browser-sdk/actions/runs/42'

describe('dispatch-publish-npm', () => {
  const commandMock = mock.fn((template: TemplateStringsArray, ...values: any[]) => {
    const text = template.reduce((acc, part, i) => `${acc}${part}${i < values.length ? values[i] : ''}`, '')
    return { run: () => (text.includes('dd-octo-sts token') ? 'fake-token\n' : '') }
  })
  const fetchMock = mock.fn<(url: string, options?: RequestInit) => Promise<Response>>()
  const timeoutMock = mock.fn((ms: number) => {
    mock.timers.tick(ms)
    return Promise.resolve()
  })
  let main: () => Promise<void>
  let version: string

  before(async () => {
    await mockModule(path.resolve(import.meta.dirname, '../lib/command.ts'), { command: commandMock })
    await mockModule(path.resolve(import.meta.dirname, '../lib/executionUtils.ts'), {
      fetchHandlingError: fetchMock,
      timeout: timeoutMock,
      printLog: () => undefined,
    })
    ;({ releaseVersion: version } = await import('../lib/browserSdkVersion.ts'))
    ;({ main } = await import('./dispatch-publish-npm.ts'))
  })

  beforeEach(() => {
    commandMock.mock.resetCalls()
    fetchMock.mock.resetCalls()
    timeoutMock.mock.resetCalls()
    mock.timers.reset()
    mock.timers.enable({ apis: ['Date'] })
  })

  function mockRunStatuses(...runs: Array<{ status: string; conclusion?: string | null }>) {
    let index = 0
    fetchMock.mock.mockImplementation((_url, options) => {
      if (options?.method === 'POST') {
        return Promise.resolve(Response.json({ workflow_run_id: 42, html_url: RUN_URL }))
      }
      const run = runs[Math.min(index++, runs.length - 1)]
      return Promise.resolve(Response.json({ conclusion: null, ...run, html_url: RUN_URL }))
    })
  }

  function assertTokenRevoked() {
    const commands = commandMock.mock.calls.map((call) => call.arguments[0].join(''))
    assert.equal(commands.filter((c) => c.includes('dd-octo-sts revoke')).length, 1)
  }

  it('dispatches the workflow on the release tag and succeeds after pending polls', async () => {
    mockRunStatuses({ status: 'queued' }, { status: 'in_progress' }, { status: 'completed', conclusion: 'success' })

    await main()

    const [url, options] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'https://api.github.com/repos/DataDog/browser-sdk/actions/workflows/publish-npm.yml/dispatches')
    assert.equal(options?.method, 'POST')
    assert.deepEqual(JSON.parse(options?.body as string), {
      ref: `v${version}`,
      inputs: { version: `v${version}` },
      return_run_details: true,
    })
    assert.equal(
      fetchMock.mock.calls[1].arguments[0],
      'https://api.github.com/repos/DataDog/browser-sdk/actions/runs/42'
    )
    assert.equal(fetchMock.mock.callCount(), 4)
    assertTokenRevoked()
  })

  for (const conclusion of ['failure', 'cancelled']) {
    it(`rejects when the run ends with ${conclusion}`, async () => {
      mockRunStatuses({ status: 'in_progress' }, { status: 'completed', conclusion })
      await assert.rejects(main(), new RegExp(`conclusion: ${conclusion}`))
      assertTokenRevoked()
    })
  }

  it('rejects when the GitHub API fails', async () => {
    fetchMock.mock.mockImplementation(() => Promise.reject(new Error('HTTP Error Response: 404')))
    await assert.rejects(main(), /Failed to call GitHub API: POST/)
    assertTokenRevoked()
  })

  it('rejects after 45 minutes without completion', async () => {
    mockRunStatuses({ status: 'in_progress' })
    await assert.rejects(main(), /Timed out waiting for workflow run/)
    assert.equal(timeoutMock.mock.callCount(), (45 * 60) / 15)
    assertTokenRevoked()
  })
})
