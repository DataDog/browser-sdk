import ApiBoundary from './api-boundary'
import PropertyBoundary from './property-boundary'
import AttributeBoundary from './attribute-boundary'

export default function Page() {
  return (
    <main>
      <h1>Next.js — element stack SSR prototype</h1>
      <p>All three sections are server-rendered. Registration runs only when they hydrate.</p>
      <ApiBoundary>
        <p data-server-content="api">Server-rendered API content</p>
      </ApiBoundary>
      <PropertyBoundary>
        <p data-server-content="property">Server-rendered property content</p>
      </PropertyBoundary>
      <AttributeBoundary>
        <p data-server-content="attribute">Server-rendered attribute content</p>
      </AttributeBoundary>
    </main>
  )
}
