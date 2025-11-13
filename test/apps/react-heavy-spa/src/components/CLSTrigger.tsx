import { useEffect, useState } from 'react'

// Component that triggers CLS on first page load
export default function CLSTrigger() {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    // Trigger layout shift after a short delay (simulates content loading)
    const timer = setTimeout(() => {
      setExpanded(true)
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      style={{
        backgroundColor: '#f0f0f0',
        padding: '10px',
        transition: 'none', // No transition to ensure immediate shift
        height: expanded ? '200px' : '0px',
        overflow: 'hidden',
        fontSize: '14px',
        fontWeight: 'bold',
        color: '#333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: expanded ? '2px solid #ddd' : 'none',
      }}
    >
      {expanded && 'This banner causes a Cumulative Layout Shift (CLS)'}
    </div>
  )
}
