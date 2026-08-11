function createContainer(id: string, title: string, borderColor: string) {
  const container = document.createElement('div')
  container.id = id
  container.style.flex = '1'
  container.style.border = `2px solid ${borderColor}`
  container.style.padding = '10px'

  const appTitle = document.createElement('h2')
  appTitle.textContent = title
  container.appendChild(appTitle)
  document.body.appendChild(container)
  return container
}

function createButton(container: HTMLElement, eventType: string, clickHandler: () => void) {
  const button = document.createElement('button')
  button.id = `${container.id}-${eventType}`
  button.textContent = `${container.id}-${eventType}`
  button.onclick = clickHandler
  container.appendChild(button)
}

export function createApp(id: string, title: string, borderColor: string) {
  const container = createContainer(id, title, borderColor)

  createButton(container, 'fetch', () => {
    void fetch('/ok')
  })

  createButton(container, 'xhr', () => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', '/ok')
    xhr.send()
  })

  createButton(container, 'error', () => {
    window.DD_RUM.addError(new Error(`${id}-error`))
  })

  createButton(container, 'console-error', () => {
    console.error(`${id}-console-error`)
  })

  createButton(container, 'runtime-error', () => {
    throw new Error(`${id}-runtime-error`)
  })

  // The `boom` call lives in the shared `lib` remote chunk while this handler lives in the app chunk,
  // so the error stack spans both chunks -> the event carries two debug IDs (app chunk + shared lib
  // chunk). The button is created only once `lib` is loaded so `boom` is always available on click.
  void import('lib/lib').then(({ boom }) => {
    createButton(container, 'nested-error', () => boom(id))
  })

  createButton(container, 'loaf', () => {
    const end = performance.now() + 55
    while (performance.now() < end) {
      // block the handler for ~55ms to trigger a long task
    }
  })

  createButton(container, 'custom-action', () => {
    window.DD_RUM.addAction(`${id}-action`)
  })

  createButton(container, 'vital', () => {
    window.DD_RUM.startDurationVital(`${id}-vital`)
    window.DD_RUM.stopDurationVital(`${id}-vital`)
  })

  createButton(container, 'feature-operation', () => {
    window.DD_RUM.startOperation(`${id}-feature-operation`)
  })

  createButton(container, 'view', () => {
    window.DD_RUM.startView({ name: `${id}-view` })
  })
}
