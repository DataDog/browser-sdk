'use client'
import { useEffect, useState, type ReactNode } from 'react'

export default function AttributeBoundary({ children, idPrefix = '' }: { children: ReactNode; idPrefix?: string }) {
  const [count, setCount] = useState(0)
  const [stack, setStack] = useState<string>()
  useEffect(() => {
    const browserStack = new Error().stack
    window.registerPrototypeSource(browserStack, 'checkout-next')
    setStack(browserStack)
  }, [])
  return (
    <section id={`${idPrefix}attribute-root`} data-dd-element-stack={new Error().stack}>
      <h2>DOM attribute</h2>
      {children}
      <button id={`${idPrefix}attribute-click`} onClick={() => setCount(count + 1)}>
        Attribute click
      </button>
      <output>{count}</output>
    </section>
  )
}
