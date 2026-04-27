import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { Home } from './pages/Home'
import { ProductDetail } from './pages/ProductDetail'
import type { CartItem } from './pages/Cart'
import { Cart } from './pages/Cart'
import { Profile } from './pages/Profile'
import { EditProfile } from './pages/EditProfile'
import type { Product } from './data/products'
import './App.css'

function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const handleAddToCart = (product: Product) => {
    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.product.id === product.id)
      if (existingItem) {
        return prev.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const handleUpdateQuantity = (productId: number, quantity: number) => {
    setCartItems((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(1, quantity) } : item))
    )
  }

  const handleRemoveItem = (productId: number) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <Router>
      <Header cartItemCount={cartItemCount} searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <Routes>
        <Route path="/" element={<Home onAddToCart={handleAddToCart} searchQuery={searchQuery} />} />
        <Route path="/:category" element={<Home onAddToCart={handleAddToCart} searchQuery={searchQuery} />} />
        <Route path="/product/:id" element={<ProductDetail onAddToCart={handleAddToCart} />} />
        <Route
          path="/cart"
          element={
            <Cart cartItems={cartItems} onUpdateQuantity={handleUpdateQuantity} onRemoveItem={handleRemoveItem} />
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/edit" element={<EditProfile />} />
      </Routes>
      <Footer />
    </Router>
  )
}

export default App
