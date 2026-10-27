export function getElementStack(
  composedPath: EventTarget[],
  elementStacks: WeakMap<Element, string>
): string | undefined {
  for (const target of composedPath) {
    if (target instanceof Element) {
      const stack = elementStacks.get(target)
      if (stack !== undefined) {
        return stack
      }
    }
  }
  return undefined
}
