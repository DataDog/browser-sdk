import { LightningElement } from 'lwc'

const INITIAL_PRODUCTS = [
  {
    id: 'dynamo-x2',
    name: 'Dynamo X2',
    category: 'Mountain',
    level: 'Expert',
    material: 'Carbon',
    msrp: 7200,
    motor: 'High torque 252 watt',
    battery: '702Wh',
    brakes: 'Hydraulic disc',
    description: 'A high-output trail bike for technical climbs and fast descents.',
  },
  {
    id: 'electra-x2',
    name: 'Electra X2',
    category: 'Road',
    level: 'Intermediate',
    material: 'Aluminum',
    msrp: 4300,
    motor: 'Balanced 250 watt',
    battery: '502Wh',
    brakes: 'Dual-pivot caliper',
    description: 'A lightweight commuter with fast handling and comfortable range.',
  },
  {
    id: 'fuse-x2',
    name: 'Fuse X2',
    category: 'Commuter',
    level: 'Beginner',
    material: 'Aluminum',
    msrp: 2600,
    motor: 'Efficient 250 watt',
    battery: '402Wh',
    brakes: 'Mechanical disc',
    description: 'An approachable city bike for everyday testing workflows.',
  },
]

export default class ProductExplorer extends LightningElement {
  products = cloneProducts(INITIAL_PRODUCTS)
  selectedProductId = INITIAL_PRODUCTS[0].id

  categoryOptions = toOptions(['Commuter', 'Mountain', 'Road'])
  levelOptions = toOptions(['Beginner', 'Intermediate', 'Expert'])
  materialOptions = toOptions(['Aluminum', 'Carbon', 'Steel'])

  get productsForView() {
    return this.products
  }

  get selectedProduct() {
    return this.products.find((product) => product.id === this.selectedProductId)
  }

  handleSelectProduct(event) {
    this.selectedProductId = event.currentTarget.dataset.id
  }

  handleFieldChange(event) {
    const field = event.currentTarget.dataset.field
    const value = field === 'msrp' ? Number(event.detail.value) : event.detail.value

    this.products = this.products.map((product) =>
      product.id === this.selectedProductId
        ? {
            ...product,
            [field]: value,
          }
        : product
    )
  }

  handleReset() {
    this.products = cloneProducts(INITIAL_PRODUCTS)
  }
}

function cloneProducts(products) {
  return products.map((product) => ({ ...product }))
}

function toOptions(values) {
  return values.map((value) => ({ label: value, value }))
}
