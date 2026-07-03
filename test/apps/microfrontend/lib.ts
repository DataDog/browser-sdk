// Shared library consumed by both app1 and app2 as a Module Federation remote.
// Loaded once at runtime, so its emitted chunk (and its debug ID) is the same for every app.
export function boom(id: string): never {
  throw new Error(`${id}-nested-error`)
}
