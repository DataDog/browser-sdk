export const countState: Record<string, number> = {}

export const count = ({ name, value }: { name: string; value?: number; context?: object }) => {
  if (countState[name] === undefined) {
    countState[name] = 0
  }

  if (value) {
    countState[name] += value
    return
  }
  countState[name]++
}
