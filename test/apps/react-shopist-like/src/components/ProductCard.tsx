import { Link } from 'react-router-dom'
import { Product } from '../data/products'

interface ProductCardProps {
  product: Product
  onAddToCart: (product: Product) => void
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link to={`/product/${product.id}`} className="product-card">
      <div className="product-image-container">
        <img src={product.image} alt={product.name} className="product-image" />
        {product.inStock && <div className="product-stock-badge">IN STOCK</div>}
      </div>
      <div className="product-info">
        <h3 className="product-name">{product.name}</h3>
        <div className="product-price">${product.price.toFixed(2)}</div>
      </div>
    </Link>
  )
}
