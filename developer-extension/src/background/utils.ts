export function evaluateCodeInActiveTab(code: (arg?: string) => void, arg?: any) {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        evaluateCodeInline(tab.id, code, arg)
      }
    }
  })
}

function evaluateCodeInline(tabId: number, code: (arg?: string) => void, arg?: any) {
  void chrome.tabs.executeScript(tabId, {
    code: `{
      const script = document.createElement('script')
      script.setAttribute("type", "module")
      script.textContent = ${JSON.stringify(`(${String(code)})(${JSON.stringify(arg)})`)}
      document.body.appendChild(script)
      script.remove()
    }`,
  })
}

export function generateUUID(placeholder?: string): string {
  return placeholder
    ? // eslint-disable-next-line  no-bitwise
      (parseInt(placeholder, 10) ^ ((Math.random() * 16) >> (parseInt(placeholder, 10) / 4))).toString(16)
    : `${1e7}-${1e3}-${4e3}-${8e3}-${1e11}`.replace(/[018]/g, generateUUID)
}
