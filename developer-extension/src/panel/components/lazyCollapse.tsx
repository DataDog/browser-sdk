import { Collapse as MantineCollapse } from '@mantine/core'
import type { CollapseProps } from '@mantine/core'
import React, { forwardRef, useRef, useState } from 'react'

/**
 * Dropin replacement for mantine Collapse component but does not render children when collapsed.
 */
export const LazyCollapse = forwardRef<HTMLDivElement, CollapseProps>(
  ({ children, expanded: expandedProp, onTransitionEnd, ...otherProps }, ref) => {
    const [isTransitioning, setIsTransitioning] = useState(false)
    const previousExpandedRef = useRef(expandedProp)

    if (previousExpandedRef.current !== expandedProp) {
      setIsTransitioning(true)
      previousExpandedRef.current = expandedProp
    }

    return (
      <MantineCollapse
        ref={ref}
        expanded={expandedProp}
        {...otherProps}
        onTransitionEnd={() => {
          setIsTransitioning(false)
          onTransitionEnd?.()
        }}
      >
        {(expandedProp || isTransitioning) && children}
      </MantineCollapse>
    )
  }
)
