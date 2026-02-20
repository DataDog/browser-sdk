export function createButton(containerApp: HTMLDivElement, id: string, clickHandler: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  const appName = containerApp.id
  button.id = `${appName}-${id}`
  button.textContent = `${appName}-${id}`
  button.onclick = clickHandler
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
