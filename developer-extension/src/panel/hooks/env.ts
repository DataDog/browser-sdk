export interface Environment {
  name: string
  version?: string
  attribute?: string
  property?: string
}

const REACT: Environment = {
  name: 'React',
  property: '__reactContainer',
  // eslint-disable-next-line quotes
  version: `node => Object.keys(node).some(p => p.startsWith("__reactRootContainer")) ? "<= 17" : Object.keys(node).some(p => p.startsWith("__reactContainer")) ? ">= 18" : "??"`,
}

// document.querySelector("*[ng-version]").getAttribute("ng-version")
const ANGULAR: Environment = {
  name: 'Angular',
  attribute: 'ng-version',
  // eslint-disable-next-line quotes
  version: `node => node.getAttribute('ng-version')`,
}

// document.querySelector("*[data-v-app]").__vue_app__.version
const VUE: Environment = {
  name: 'Vue',
  attribute: 'data-v-app',
  version: 'node => node.__vue_app__?.version',
}

const SVELTE: Environment = {
  name: 'Svelte',
  property: '__svelte_meta',
  version: 'node => "unknown"',
}

export const ENVIRONMENTS = [REACT, ANGULAR, VUE, SVELTE]
