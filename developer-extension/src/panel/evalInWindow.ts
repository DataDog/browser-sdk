export function evalInWindow(code: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.devtools.inspectedWindow.eval(`(() => { ${code} })()`, (result, exceptionInfo) => {
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
        }
      } else {
        resolve(result)
      }
    })
  })
}
