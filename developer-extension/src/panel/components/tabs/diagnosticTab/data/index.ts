import { data as custom } from './custom'
import { data as es5 } from './es5'
import { data as es6 } from './es6'
import { data as es2016plus } from './es2016plus'
import { data as esnext } from './esnext'

export interface Test {
  name: string
  category?: string
  spec?: string
  mdn?: string
  significance?: string
  subtests?: Test[]
  exec?: () => void
}

export const data: Test[] = [
  {
    name: 'Custom',
    subtests: custom,
  },
  {
    name: 'ECMAScript 5',
    subtests: es5,
  },
  {
    name: 'ECMAScript 6',
    subtests: es6,
  },
  {
    name: 'ECMAScript 2016+',
    subtests: es2016plus,
  },
  {
    name: 'ECMAScript Next',
    subtests: esnext,
  },
]
