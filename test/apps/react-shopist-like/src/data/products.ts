export interface Product {
  id: number
  name: string
  category: string
  price: number
  image: string
  description: string
  inStock: boolean
  rating: number
}

export const categories = ['Chairs', 'Sofas', 'Bedding', 'Lighting']

export async function fetchProducts(): Promise<Product[]> {
  const response = await fetch('/products.json')
  if (!response.ok) {
    throw new Error('Failed to fetch products')
  }
  return response.json()
}
