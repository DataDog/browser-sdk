export function evaluateCodeInActiveTab(code: (arg?: string) => void, arg?: string) {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        evaluateCodeInline(tab.id, code, arg)
      }
    }
  })
}

function evaluateCodeInline(tabId: number, code: (arg?: string) => void, arg?: string) {
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
