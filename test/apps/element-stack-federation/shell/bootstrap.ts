import './rum'

interface Remote {
  mount(container: HTMLElement): (() => void) | Promise<() => void>
}
async function load(id: string, loader: () => Promise<Remote>) {
  const container = document.getElementById(`${id}-container`)!
  const status = document.getElementById(`${id}-status`)!
  const toggle = document.getElementById(`${id}-toggle`) as HTMLButtonElement
  try {
    const remote = await loader()
    let dispose: (() => void) | undefined = await remote.mount(container)
    status.textContent = 'Loaded'
    toggle.disabled = false
    toggle.onclick = async () => {
      toggle.disabled = true
      if (dispose) {
        dispose()
        dispose = undefined
        container.replaceChildren()
        toggle.textContent = 'Mount'
        status.textContent = 'Unmounted'
      } else {
        dispose = await remote.mount(container)
        toggle.textContent = 'Unmount'
        status.textContent = 'Loaded'
      }
      toggle.disabled = false
    }
  } catch (error) {
    status.textContent = `Failed: ${String(error)}`
    console.error(error)
  }
}

// The shell only mounts remotes. Each remote owns its stack registration.
void load('react', () => import('reactMfe/mount'))
void load('vue', () => import('vueMfe/mount'))
void load('angular', () => import('angularMfe/mount'))

let shellClicks = 0
document.getElementById('shell-click')!.onclick = () => {
  document.getElementById('shell-count')!.textContent = String(++shellClicks)
}
