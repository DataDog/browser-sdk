import ApiBoundary from './api-boundary'
import PropertyBoundary from './property-boundary'
import AttributeBoundary from './attribute-boundary'
export function App() {
  return (
    <>
      <ApiBoundary idPrefix="react-">
        <p>Client-rendered React boundary.</p>
      </ApiBoundary>
      <PropertyBoundary idPrefix="react-">
        <p>The MFE captures this stack directly.</p>
      </PropertyBoundary>
      <AttributeBoundary idPrefix="react-">
        <p>Set in the browser when mounted.</p>
      </AttributeBoundary>
    </>
  )
}
