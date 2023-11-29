export function copy(text: string) {
  // Unfortunately, navigator.clipboard.writeText does not seem to work in extensions
  const container = document.createElement('textarea')
  container.innerHTML = text
  document.body.appendChild(container)
  container.select()
  document.execCommand('copy')
  document.body.removeChild(container)
}
