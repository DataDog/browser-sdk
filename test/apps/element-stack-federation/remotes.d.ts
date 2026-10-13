declare module 'reactMfe/mount' {
  export function mount(container: HTMLElement): () => void
}
declare module 'vueMfe/mount' {
  export function mount(container: HTMLElement): () => void
}
declare module 'angularMfe/mount' {
  export function mount(container: HTMLElement): Promise<() => void>
}
declare module '*.vue' {
  const component: import('vue').DefineComponent
  export default component
}
