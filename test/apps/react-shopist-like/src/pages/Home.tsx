import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import type { Product } from '../data/products'
import { fetchProducts } from '../data/products'
import { ProductCard } from '../components/ProductCard'
import { PromoBanner } from '../components/PromoBanner'

interface HomeProps {
  onAddToCart: (product: Product) => void
  searchQuery: string
}

export function Home({ onAddToCart, searchQuery }: HomeProps) {
  const { category } = useParams<{ category?: string }>()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
      .then((data) => {
        setProducts(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        // Normalize category from URL (e.g., "chairs" -> "Chairs")
        const normalizedCategory = category ? category.charAt(0).toUpperCase() + category.slice(1).toLowerCase() : ''

        const matchesCategory = !normalizedCategory || product.category === normalizedCategory
        const matchesSearch =
          product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product.description.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesCategory && matchesSearch
      }),
    [products, searchQuery, category]
  )

  if (loading) {
    return (
      <div className="main-content">
        <div className="product-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton-card">
              <div className="skeleton-image"></div>
              <div className="skeleton-info">
                <div className="skeleton-title"></div>
                <div className="skeleton-price"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="main-content">
        <div className="empty-cart">
          <h2>Error loading products</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="main-content">
      {filteredProducts.length !== 0 && (
        <>
          <PromoBanner />
          <div className="product-grid">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} onAddToCart={onAddToCart} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
