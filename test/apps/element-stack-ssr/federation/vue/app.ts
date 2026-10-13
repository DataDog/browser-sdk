import { h } from 'vue'
import ApiBoundary from '../../nuxt/app/components/ApiBoundary.vue'
import PropertyBoundary from '../../nuxt/app/components/PropertyBoundary.vue'
import AttributeBoundary from '../../nuxt/app/components/AttributeBoundary.vue'
export const App = {
  render: () => [
    h(ApiBoundary, { idPrefix: 'vue-' }, { default: () => h('p', 'Client-rendered Vue boundary.') }),
    h(PropertyBoundary, { idPrefix: 'vue-' }, { default: () => h('p', 'The MFE captures this stack directly.') }),
    h(AttributeBoundary, { idPrefix: 'vue-' }, { default: () => h('p', 'Set in the browser when mounted.') }),
  ],
}
