export interface Account {
  id: string
  name?: string | undefined
  [key: string]: unknown
}
