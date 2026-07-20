interface VitestCommand {
  arguments: string[]
  watch: boolean
}

/**
 * Preserve the Browser SDK unit-test CLI while translating legacy options to Vitest.
 */
export function buildVitestCommand(arguments_: string[]): VitestCommand {
  const vitestArguments: string[] = []
  let watch = false

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]

    if (argument === '--watch' || argument === '--no-single-run') {
      watch = true
      continue
    }

    if (argument === '--spec' || argument === '--seed') {
      const value = arguments_[index + 1]
      if (!value) {
        throw new Error(`Missing value for ${argument}`)
      }
      index += 1
      vitestArguments.push(argument === '--spec' ? value : `--sequence.seed=${value}`)
      continue
    }

    if (argument.startsWith('--spec=')) {
      vitestArguments.push(argument.slice('--spec='.length))
      continue
    }

    if (argument.startsWith('--seed=')) {
      vitestArguments.push(`--sequence.seed=${argument.slice('--seed='.length)}`)
      continue
    }

    vitestArguments.push(argument)
  }

  return { arguments: vitestArguments, watch }
}
