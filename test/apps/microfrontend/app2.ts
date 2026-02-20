export function createButton(containerApp: HTMLDivElement, id: string, clickHandler: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  const appName = containerApp.id
  button.id = `${appName}-${id}`
  button.textContent = `${appName}-${id}`
  button.onclick = () => clickHandler()
  containerApp.appendChild(button)
  return button
}

export function createAppContainer(id: string, title: string, borderColor: string): HTMLDivElement {
  const appContainer = document.createElement('div')
  appContainer.id = id
  appContainer.style.flex = '1'
  appContainer.style.border = `2px solid ${borderColor}`
  appContainer.style.padding = '10px'

  const appTitle = document.createElement('h2')
  appTitle.textContent = title
  appContainer.appendChild(appTitle)

  return appContainer
}

const containerApp = createAppContainer('app2', 'App 2 (mf-app2-service v0.2.0)', 'green')
document.body.appendChild(containerApp)

createButton(containerApp, 'fetch-button', () => {
  fetch('/ok').then(
    () => {
      /* empty */
    },
    () => {
      /* empty */
    }
  )
})

createButton(containerApp, 'xhr-button', () => {
  const xhr = new XMLHttpRequest()
  xhr.open('GET', '/ok')
  xhr.send()
})

createButton(containerApp, 'error-button', () => {
  window.DD_RUM.addError(new Error('mf-app2-error'))
})

createButton(containerApp, 'console-error-button', () => {
  console.error('mf-app2-console-error')
})

createButton(containerApp, 'runtime-error-button', () => {
  throw new Error('mf-app2-runtime-error')
})

createButton(containerApp, 'loaf-button', () => {
  const end = performance.now() + 55
  while (performance.now() < end) {
    // block the handler for ~55ms to trigger a long task
  }
})

createButton(containerApp, 'custom-action-button', () => {
  window.DD_RUM.addAction('mf-app2-action')
})

createButton(containerApp, 'vital-button', () => {
  const ref = window.DD_RUM.startDurationVital('mf-app2-vital')
  window.DD_RUM.stopDurationVital(ref)
})

createButton(containerApp, 'view-button', () => {
  window.DD_RUM.startView({ name: 'mf-app2-view' })
})
