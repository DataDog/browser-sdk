export function evaluateCodeInActiveTab(code: string) {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        evaluateCodeInline(tab.id, code)
      }
    }
  })
}

function evaluateCodeInline(tabId: number, code: string) {
  chrome.tabs.executeScript(tabId, {
    code: `{
      const script = document.createElement('script')
      script.setAttribute("type", "module")
      script.textContent = ${JSON.stringify(code)}
      document.body.appendChild(script)
      script.remove()
    }`,
  })
}
