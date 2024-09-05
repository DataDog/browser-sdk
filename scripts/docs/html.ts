export class Html {
  content: string
  constructor(content: string) {
    this.content = content
  }
  static empty() {
    return new Html('')
  }
  toString() {
    return this.content
  }
}

export function html(strings: TemplateStringsArray, ...variables: unknown[]) {
  let output = strings[0]
  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i]
    if (variable instanceof Html) {
      output += variable.toString()
    } else if (variable instanceof Array) {
      output += variable.join('')
    } else {
      output += escapeHtml(String(variable))
    }
    output += strings[i + 1]
  }
  return new Html(output)
}

function escapeHtml(input: unknown): string {
  if (input instanceof Html) {
    return input.toString()
  }

  if (input instanceof Array) {
    return input.map(escapeHtml).join('')
  }

  return String(input).replace(/["&'<>]/g, (match) => `&#${match.charCodeAt(0)};`)
}
