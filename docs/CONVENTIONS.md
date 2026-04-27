# Conventions

## Dependencies as parameters

Favor passing a loosely coupled domain dependency as a parameter instead of statically importing it for:

- **Readability**: Better see which external concepts are involved
- **Testability**: Easily substitute a dependency by a mock to focus on test subject behaviors
- **Extensibility**: Easily replace a dependency with another one with the same signature as needs change

**Examples:**

- **OK** to statically import generic utilities

  ```typescript
  import { find } from 'utils'
  ```

- **OK** to split a file for maintenance purpose and statically import the different parts

  ```typescript
  import { mySubBehavior } from './mySubBehavior'
  import { myOtherSubBehavior } from './myOtherSubBehavior'

  function startMyModule() {
    mySubBehavior()
    myOtherSubBehavior()
  }
  ```

- For two different modules, with one depending on the other:
  - **KO** to statically retrieve the dependency

    ```typescript
    import { getOrCreateMyDependency } from './myDependency'

    function startMyModule() {
      myDependency = getOrCreateMyDependency()
      myDependency.interact()
    }
    ```

  - **KO** to statically expose a part of the dependency

    ```typescript
    // boot
    myDependency = startMyDependency()
    myModule = startMyModule()

    // myModule.ts
    import { interactWithMyDependency } from './myDependency'

    function startMyModule() {
      interactWithMyDependency()
    }
    ```

  - **OK**

    ```typescript
    // boot
    myDependency = startMyDependency()
    myOtherDependency = getOrCreateMyDependency()
    myModule = startMyModule(myDependency, myOtherDependency)

    // myModule.ts
    function startMyModule(myDependency, myOtherDependency) {
      myDependency.interact()
      myOtherDependency.interact()
    }
    ```

## Avoid global polyfill

Avoid polluting browser context or conflicting with customer own polyfills.

**Example:**

- **KO** to overwrite global API

  ```typescript
  window.URL = window.URL || buildUrl(url: string, base?: string) {
    ...
  }
  ```

- **OK** to use our own utility internally

  ```typescript
  export function buildUrl(url: string, base?: string) {
    ...
  }
  ```

## File organization

In the different packages, we try to split code relative to different concerns to ease discoverability and reusability:

- **Boot**: code related to API declaration and init phase of the SDK
- **Domain**: code specific to our products: `configuration`, `action`, `views`, `assembly`, ...
- **Tools**: utilities used across the code base without domain logic: `observable`, `timeUtils`, ...
- **Browser**: code wrapping browser APIs without domain logic to use more convenient API, extend capabilities, handle edge cases: `performanceCollection`, `cookie`, ...
- **Transport**: code related to final data transport (server/bridge): `batch`, `httpRequest`, `replicas`, ...

## Index module usage

Use index.ts files to expose a single, minimal API in directories where modules are used together.
Do not use index.ts when a directory contains independent modules.
An index.ts file should not have exports only used for spec files.

**Examples:**

- Directory with similar but independent modules: `core/src/tools`
- Directory with single domain split in several files: `core/src/transport`

## Utility files

It is useful to extract reusable code in "utils" files.

To increase discoverability and limit the scope of those files, specialize them with a relevant prefix and keep them close to where they are used.

Examples: `serializationUtils`, `resourceUtils`, ...

## SpecHelper files

It is useful to extract tests shared code in "specHelper" files.

To increase discoverability and limit the scope of those files, specialize them with a relevant prefix and keep them close to where they are used.

Examples: `htmlAst.specHelper.ts`, `location.specHelper.ts`, ...

## Size control

### Favor function over class

Class syntax does not play well with minification, even without being transpiled as ES5 syntax:

```javascript
class Batch {
  pendingMessages = []
  add(message) {
    this.pendingMessages.push(message)
  }
}

// bundled as (64 bytes):
class s {
  pendingMessages = []
  add(s) {
    this.pendingMessages.push(s)
  }
}
```

Instead, prefer using closures (or plain functions when possible):

```javascript
function createBatch() {
  const pendingMessages = []
  return {
    add(message) {
      pendingMessages.push(message)
    },
  }
}

// bundled as (50 bytes):
function n() {
  const n = []
  return {
    add(t) {
      n.push(t)
    },
  }
}
```

(use `pbpaste | npx terser -m --toplevel` to get the minified version)

### Favor const enum

They generally produce less code.

## Public APIs

### Don't use enum in public APIs or types

We want to give the user flexibility on how to specify constant options, to let them choose between hardcoded strings or importing some constant.

### Use option parameter for customer-provided functions

```javascript
function customerFn({ foo, bar }) {} // OK
function customerFn(foo, bar) {} // KO
```

For functions API (startView, addAction), if we want to support new inputs, we can tweak the behavior to support both old and new inputs and avoid a breaking change.

However, for customer-provided functions (beforeSend, allowTracingUrl), introducing a change in the input could be a breaking change because the customer implementation would not support it. To have more flexibility in those cases, favor an option input parameter over multiple parameters.

_Note_: to avoid unnecessary customer migration, don't update existing APIs until it is needed.
