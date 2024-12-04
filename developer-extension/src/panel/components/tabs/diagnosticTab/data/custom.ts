import type { Test } from '.'

declare function asyncTestPassed(): void
declare function asyncTestFailed(): void

export const data: Test[] = [
  {
    name: 'trusted events',
    category: 'datadog',
    exec() {
      const request = new XMLHttpRequest()
      // TODO pot to proxy or to datadog intake to go around CSP
      request.open('POST', 'https://7fc280bc.datadoghq.com/api/v2/logs', true)

      request.addEventListener(
        'loadend',
        (event) => {
          event.isTrusted ? asyncTestPassed() : asyncTestFailed()
        },
        { once: true }
      )

      request.send('')
    },
  },
]
