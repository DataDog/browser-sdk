import { useState, type ReactNode } from 'react'

function registerRoot(element: HTMLElement | null) {
  if (element) {
    element.dd_element_stack = new Error().stack
  }
}

export default function PropertyBoundary({ children, idPrefix = '' }: { children: ReactNode; idPrefix?: string }) {
  const [count, setCount] = useState(0)
  return (
    <section id={`${idPrefix}property-root`} ref={registerRoot}>
      <h2>Custom property</h2>
      {children}
      <button id={`${idPrefix}property-click`} onClick={() => setCount(count + 1)}>
        Property click
      </button>
      <output>{count}</output>
    </section>
  )
}
