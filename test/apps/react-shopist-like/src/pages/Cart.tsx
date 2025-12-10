import { useNavigate } from 'react-router-dom'
import type { Product } from '../data/products'

export interface CartItem {
  product: Product
  quantity: number
}

interface CartProps {
  cartItems: CartItem[]
  onUpdateQuantity: (productId: number, quantity: number) => void
  onRemoveItem: (productId: number) => void
}

export function Cart({ cartItems, onUpdateQuantity, onRemoveItem }: CartProps) {
  const navigate = useNavigate()

  const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  if (cartItems.length === 0) {
    return (
      <div className="main-content">
        <div className="cart-page">
          <div className="empty-cart">
            <h2>Your cart is empty</h2>
            <p>Add some products to get started!</p>
            <button onClick={() => navigate('/')} className="back-button">
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    )
  }

  const subtotal = total
  const tax = total * 0.08
  const shipping = 61.0
  const processingFees = 0.0
  const grandTotal = subtotal + tax + shipping + processingFees

  return (
    <div className="main-content">
      <div className="cart-page">
        <div className="cart-layout">
          <div className="cart-items-section">
            <h1>Your Items</h1>
            <div className="cart-items">
              {cartItems.map((item) => (
                <div key={item.product.id} className="cart-item">
                  <img src={item.product.image} alt={item.product.name} className="cart-item-image" />
                  <div className="cart-item-info">
                    <div className="cart-item-name">
                      {item.product.name} (${item.product.price.toFixed(2)})
                    </div>
                  </div>
                  <div className="cart-item-actions">
                    <button
                      className="quantity-button"
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </button>
                    <span style={{ padding: '0 1rem', fontWeight: 600 }}>{item.quantity}</span>
                    <button
                      className="quantity-button"
                      onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
                    >
                      +
                    </button>
                    <button className="remove-button" onClick={() => onRemoveItem(item.product.id)}>
                      Remove
                    </button>
                  </div>
                  <div className="cart-item-price">${(item.product.price * item.quantity).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="cart-summary-section">
            <h2>Summary</h2>
            <div className="cart-summary">
              <div className="summary-row">
                <span>Order value</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Tax</span>
                <span>{tax.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Shipping</span>
                <span>{shipping.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Processing Fees</span>
                <span>{processingFees.toFixed(2)}</span>
              </div>
              <div className="summary-row summary-total">
                <span>Total</span>
                <span>${grandTotal.toFixed(2)}</span>
              </div>
              <div className="discount-code">
                <input type="text" placeholder="Discount code" className="discount-input" />
                <button className="apply-button">APPLY</button>
              </div>
              <button className="checkout-button">CHECKOUT</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
