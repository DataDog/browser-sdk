import { wait } from './wait'

function evalInInspectedWindow(code: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(code, (result, exceptionInfo) => {
      if (exceptionInfo) {
        if (exceptionInfo.isError) {
          reject(
            Object.assign(
              new Error(`DevTools error while evaluating code: [${exceptionInfo.code}] ${exceptionInfo.description}`),
              {
                details: exceptionInfo.details,
              }
            )
          )
        } else if (exceptionInfo.isException) {
          reject(new Error(`Failed to evaluate code: ${exceptionInfo.value}`))
        } else {
          reject(new Error('Unexpected DevTools error while evaluating code'))
        }
      } else {
        resolve(result)
      }
    })
  })
}

export function evalInWindow(code: string): Promise<unknown> {
  return evalInInspectedWindow(`(() => { ${code} })()`)
}

const RETRY_TIME_LIMIT_MS = 500

let nextAsyncId = 0

export async function runInWindow<Result>(action: () => Promise<Result>): Promise<Result>
export async function runInWindow<Result>(action: () => Result): Promise<Result>
export async function runInWindow<Result>(action: () => Result): Promise<Result> {
  const resultVar = `$_dd_dev_ext_async_${nextAsyncId++}`

  await evalInInspectedWindow(`
    Promise.resolve((${action.toString()})()).then(result => {
     window['${resultVar}'] = { result }
    }).catch(error => {
     window['${resultVar}'] = { error }
    })`)

  const start = Date.now()
  let result
  do {
    if (Date.now() - start >= RETRY_TIME_LIMIT_MS) {
      throw new Error('Failed to evaluate async code: exceeded retry time limit')
    }

    await wait(10)

    result = await evalInInspectedWindow(`(() => {
        const result = window['${resultVar}']
        delete window['${resultVar}']
        if (!result) {
          return undefined
        }
        if (result.error) {
          throw result.error
        } else {
          return result.result
        }
      })()`)
  } while (typeof result === 'undefined')

  return result as Result
}
