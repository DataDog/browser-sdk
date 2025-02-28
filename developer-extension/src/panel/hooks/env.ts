export interface Environment {
  name: string
  version?: string
  attribute?: string
  property?: string
  object?: string
}

const REACT: Environment = {
  name: 'React',
  property: '__reactContainer',
  // eslint-disable-next-line quotes
  version: `node => Object.keys(node).some(p => p.startsWith("__reactRootContainer")) ? "<= 17" : Object.keys(node).some(p => p.startsWith("__reactContainer")) ? ">= 18" : "??"`,
}

const NEXTJS: Environment = {
  name: 'NextJS',
  object: 'next',
  // eslint-disable-next-line quotes
  version: `node => node.version`,
}

// document.querySelector("*[ng-version]").getAttribute("ng-version")
const ANGULAR: Environment = {
  name: 'Angular',
  attribute: 'ng-version',
  // eslint-disable-next-line quotes
  version: `target => target.getAttribute('ng-version')`,
}

// document.querySelector("*[data-v-app]").__vue_app__.version
const VUE: Environment = {
  name: 'Vue',
  attribute: 'data-v-app',
  version: 'target => target.__vue_app__?.version',
}

const SVELTE: Environment = {
  name: 'Svelte',
  property: '__svelte_meta',
  version: 'target => "unknown"',
}

const SENTRY: Environment = {
  name: 'Sentry',
  object: '__SENTRY__',
  version: 'target => target.hub?._version || target.version ',
}

const SEGMENT: Environment = {
  name: 'Segment',
  object: 'analytics',
  version: 'target => target.SNIPPET_VERSION || target.VERSION',
}

export const ENVIRONMENTS = [REACT, ANGULAR, VUE, SVELTE, SENTRY, SEGMENT, NEXTJS]
