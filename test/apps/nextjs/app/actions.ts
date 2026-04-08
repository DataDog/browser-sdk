'use server'

import { withDatadogServerAction } from 'dd-trace/next'

export async function greetAction(formData: FormData): Promise<string> {
  return withDatadogServerAction('greetAction', async () => {
    const name = formData.get('name') as string
    // Simulate server-side processing delay
    await new Promise((resolve) => setTimeout(resolve, 200))
    return `Hello, ${name || 'World'}! (from Server Action at ${new Date().toISOString()})`
  })
}

export async function slowAction(): Promise<string> {
  return withDatadogServerAction('slowAction', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return `Slow action completed at ${new Date().toISOString()}`
  })
}

export async function failingAction(): Promise<string> {
  return withDatadogServerAction('failingAction', async () => {
    throw new Error('Server Action intentional failure')
  })
}
