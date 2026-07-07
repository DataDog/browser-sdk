import { LightningElement } from 'lwc'

const PRODUCTS = [
  { id: 'dynamo-x2', name: 'Dynamo X2', category: 'Mountain', material: 'Aluminum', level: 'Beginner', price: 2999 },
  { id: 'electra-series', name: 'Electra Series', category: 'Commuter', material: 'Carbon', level: 'Enthusiast', price: 3499 },
  { id: 'ranger-trail', name: 'Ranger Trail', category: 'Mountain', material: 'Carbon', level: 'Racer', price: 1899 },
  { id: 'summit-pro', name: 'Summit Pro', category: 'Commuter', material: 'Aluminum', level: 'Enthusiast', price: 2199 },
  { id: 'cascade-lt', name: 'Cascade LT', category: 'Commuter', material: 'Aluminum', level: 'Beginner', price: 1299 },
  { id: 'vertex-fs', name: 'Vertex FS', category: 'Mountain', material: 'Carbon', level: 'Racer', price: 4299 },
]

const MATERIAL_VALUES = ['Aluminum', 'Carbon']
const LEVEL_VALUES = ['Beginner', 'Enthusiast', 'Racer']

export default class ExperienceProductExplorer extends LightningElement {
  searchKey = ''
  maxPrice = 10000
  selectedMaterials = []
  selectedLevels = []

  handleSearchKeyChange(event) {
    this.searchKey = event.target.value
  }

  handleMaxPriceChange(event) {
    this.maxPrice = Number(event.target.value)
  }

  handleFilterToggle(event) {
    const { group, value } = event.target.dataset
    const listName = `selected${group[0].toUpperCase()}${group.slice(1)}s`
    const current = this[listName]
    this[listName] = event.target.checked ? [...current, value] : current.filter((entry) => entry !== value)
  }

  handleViewDetailsClick(event) {
    const productId = event.currentTarget.dataset.productId

    window.DD_RUM?.addAction('product explorer view details', {
      source: 'salesforce-experience-product-explorer',
      productId,
      pathname: window.location?.pathname,
    })
  }

  get formattedMaxPrice() {
    return `$${this.maxPrice.toLocaleString()}`
  }

  get materialOptions() {
    return this.buildOptions(MATERIAL_VALUES, this.selectedMaterials)
  }

  get levelOptions() {
    return this.buildOptions(LEVEL_VALUES, this.selectedLevels)
  }

  buildOptions(values, selected) {
    return values.map((value) => ({ value, checked: selected.includes(value) }))
  }

  get filteredProducts() {
    const searchKey = this.searchKey.trim().toLowerCase()

    return PRODUCTS.filter((product) => {
      if (searchKey && !product.name.toLowerCase().includes(searchKey)) {
        return false
      }
      if (product.price > this.maxPrice) {
        return false
      }
      if (this.selectedMaterials.length && !this.selectedMaterials.includes(product.material)) {
        return false
      }
      if (this.selectedLevels.length && !this.selectedLevels.includes(product.level)) {
        return false
      }
      return true
    }).map((product) => ({ ...product, formattedPrice: `$${product.price.toLocaleString()}` }))
  }

  get noResults() {
    return this.filteredProducts.length === 0
  }
}
