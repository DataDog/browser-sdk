/**
 * Remove the index signature from an object type
 * @example
 * type Foo = { a: string, b: number, [key: string]: any }
 * type Bar = RemoveIndex<Foo> // { a: string, b: number }
 */
export type RemoveIndex<T> = {
  [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
}

/**
 * Turn a camel case string into a snake case string
 * @example
 * type Foo = CamelToSnakeCase<'fooBarBaz'> // 'foo_bar_baz'
 */
export type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${CamelToSnakeCase<U>}`
  : S
