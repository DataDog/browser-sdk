export interface Test {
  name: string
  category?: string
  spec?: string
  mdn?: string
  significance?: string
  subtests?: Test[]
  exec?: () => void
}
