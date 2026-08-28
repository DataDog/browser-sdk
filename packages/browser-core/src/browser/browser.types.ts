// Those types come from the official TypeScript DOM library, but are not included in our minimal
// supported TS version.
// https://github.com/microsoft/TypeScript/blob/13c374a868c926f6a907666a5599992c1351b773/src/lib/dom.generated.d.ts#L15399-L15418

export interface WeakRef<T extends object> {
  readonly [Symbol.toStringTag]: 'WeakRef'

  deref(): T | undefined
}

export interface WeakRefConstructor {
  readonly prototype: WeakRef<any>

  new <T extends object>(target: T): WeakRef<T>
}
