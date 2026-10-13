'use client'
import { useState, type ReactNode } from 'react'

function registerRoot(element: HTMLElement | null) {
  if (element) {
    window.registerPrototypeSource(new Error().stack, 'checkout-next')
    window.DD_RUM.attachElementStack(element)
  }
}

export default function ApiBoundary({ children, idPrefix = '' }: { children: ReactNode; idPrefix?: string }) {
  const [count, setCount] = useState(0)
  return (
    <section id={`${idPrefix}api-root`} ref={registerRoot}>
      <h2>SDK API</h2>
      {children}
      <button id={`${idPrefix}api-click`} onClick={() => setCount(count + 1)}>
        API click
      </button>
      <output>{count}</output>
    </section>
  )
}
