import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMessage } from './reportAsAPrComment.ts'

void describe('reportAsAPrComment', () => {
  void describe('createMessage', () => {
    const TEST_BUNDLE = 'test'
    const PR_NUMBER = 123

    const BASE_BUNDLE_SIZES = [{ name: TEST_BUNDLE, value: 100 }]
    const MEMORY_BASE_PERFORMANCE = [{ name: TEST_BUNDLE, value: 100 }]
    const CPU_BASE_PERFORMANCE = [{ name: TEST_BUNDLE, value: 100 }]

    const MEMORY_LOCAL_PERFORMANCE = [{ testProperty: TEST_BUNDLE, sdkMemoryBytes: 101, sdkMemoryPercentage: 10 }]
    const CPU_LOCAL_PERFORMANCE = [{ name: TEST_BUNDLE, value: 101 }]

    void it('should generate a report with performance results', () => {
      const localBundleSizes = { test: 101 }

      const message = createMessage(
        BASE_BUNDLE_SIZES,
        localBundleSizes,
        MEMORY_BASE_PERFORMANCE,
        MEMORY_LOCAL_PERFORMANCE,
        CPU_BASE_PERFORMANCE,
        CPU_LOCAL_PERFORMANCE,
        PR_NUMBER
      )

      assert.equal(
        message,
        `| 📦 Bundle Name | Base Size | Local Size | 𝚫 | 𝚫% | Status |
| --- | --- | --- | --- | --- | --- |
| Test | 100 B | 101 B | 1 B | +1.00% | ✅ |
</details>

<details>
<summary>🚀 CPU Performance</summary>

| Action Name | Base Average Cpu Time (ms) | Local Average Cpu Time (ms) | 𝚫 |
| --- | --- | --- | --- |
| test | 100.000 | 101.000 | 1.000 |

</details>

<details>
<summary>🧠 Memory Performance</summary>

| Action Name | Base Consumption Memory (bytes) | Local Consumption Memory (bytes) | 𝚫 (bytes) |
| --- | --- | --- | --- |
| test | 100 B | 101 B | 1 B |

</details>

🔗 [RealWorld](https://datadoghq.dev/browser-sdk-test-playground/realworld-scenario/?prNumber=123)

`
      )
    })

    void it('should add a warning when the size increase is above the threshold', () => {
      const localBundleSizes = { test: 150 }

      const message = createMessage(
        BASE_BUNDLE_SIZES,
        localBundleSizes,
        MEMORY_BASE_PERFORMANCE,
        MEMORY_LOCAL_PERFORMANCE,
        CPU_BASE_PERFORMANCE,
        CPU_LOCAL_PERFORMANCE,
        PR_NUMBER
      )

      assertContains(message, '| Test | 100 B | 150 B | 50 B | +50.00% | ⚠️ |')
      assertContains(message, '⚠️ The increase is particularly high and exceeds 5%. Please check the changes.')
    })
  })
})

function assertContains(actual: string, expected: string) {
  assert.ok(
    actual.includes(expected),
    ['Expected string to contain:', `  expected: "${expected}"`, `  actual:   "${actual}"`].join('\n')
  )
}
