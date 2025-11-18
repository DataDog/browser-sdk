import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { Product } from '../data/products'
import { fetchProducts } from '../data/products'

interface ProductDetailProps {
  onAddToCart: (product: Product) => void
}

export function ProductDetail({ onAddToCart }: ProductDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
      .then((products) => {
        const found = products.find((p) => p.id === Number(id))
        setProduct(found || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="main-content">
        <div className="empty-cart">
          <h2>Loading product...</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="main-content">
        <div className="empty-cart">
          <h2>Error loading product</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="back-button">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="main-content">
        <div className="empty-cart">
          <h2>Product not found</h2>
          <button onClick={() => navigate('/')} className="back-button">
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      <div className="product-detail">
        <div className="product-detail-content">
          <img src={product.image} alt={product.name} className="product-detail-image" />
          <div className="product-detail-info">
            <div className="product-category">{product.category}</div>
            <h1>{product.name}</h1>
            <div className="product-rating">
              {'★'.repeat(Math.floor(product.rating))}
              {'☆'.repeat(5 - Math.floor(product.rating))} {product.rating} / 5
            </div>
            <div className="product-price">${product.price.toFixed(2)}</div>
            <div className={`product-stock ${product.inStock ? 'in-stock' : ''}`}>
              {product.inStock ? 'In Stock' : 'Out of Stock'}
            </div>
            <p className="product-description">{product.description}</p>
            <button
              className="add-to-cart-button"
              onClick={() => onAddToCart(product)}
              disabled={!product.inStock}
              style={{ marginBottom: '1rem' }}
            >
              Add to Cart
            </button>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Products
        </button>
      </div>
    </div>
  )
}
