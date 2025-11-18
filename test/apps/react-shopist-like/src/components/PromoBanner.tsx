import { useState, useEffect } from 'react'

export function PromoBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Delay banner appearance to cause CLS
    const timer = setTimeout(() => {
      setShow(true)
    }, 200)

    return () => clearTimeout(timer)
  }, [])

  if (!show) return null

  return (
    <div className="promo-banner">
      <div className="promo-content">
        <span className="promo-badge">SALE</span>
        <p className="promo-text">Summer Collection - Up to 50% Off on Selected Items</p>
        <button className="promo-button">Shop Now</button>
      </div>
    </div>
  )
}
