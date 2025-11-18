declare module 'react-window' {
  import * as React from 'react'

  export interface ListChildComponentProps<T = unknown> {
    index: number
    style: React.CSSProperties
    data?: T
  }

  export interface FixedSizeListProps<T = unknown> {
    children: React.ComponentType<ListChildComponentProps<T>>
    className?: string
    direction?: 'ltr' | 'rtl'
    height: number | string
    initialScrollOffset?: number
    innerRef?: React.Ref<unknown>
    innerElementType?: React.ElementType
    innerTagName?: string
    itemCount: number
    itemData?: T
    itemKey?: (index: number, data: T) => unknown
    itemSize: number
    layout?: 'horizontal' | 'vertical'
    onItemsRendered?: (props: {
      overscanStartIndex: number
      overscanStopIndex: number
      visibleStartIndex: number
      visibleStopIndex: number
    }) => void
    onScroll?: (props: {
      scrollDirection: 'forward' | 'backward'
      scrollOffset: number
      scrollUpdateWasRequested: boolean
    }) => void
    outerRef?: React.Ref<unknown>
    outerElementType?: React.ElementType
    outerTagName?: string
    overscanCount?: number
    style?: React.CSSProperties
    useIsScrolling?: boolean
    width?: number | string
  }

  export class FixedSizeList<T = unknown> extends React.Component<FixedSizeListProps<T>> {
    scrollTo(scrollOffset: number): void
    scrollToItem(index: number, align?: 'auto' | 'smart' | 'center' | 'end' | 'start'): void
  }
}
