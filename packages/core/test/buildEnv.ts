// to simulate different build env behavior
export interface BuildEnvWindow {
  __BUILD_ENV__SDK_VERSION__: string
}

;(window as unknown as BuildEnvWindow).__BUILD_ENV__SDK_VERSION__ = 'test'