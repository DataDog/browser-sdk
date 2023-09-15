import { Collapse as MantineCollapse } from '@mantine/core'
import type { CollapseProps } from '@mantine/core'
import React, { forwardRef, useRef, useState } from 'react'

/**
 * Dropin replacement for mantine Collapse component but does not render children when collapsed.
 */
export const LazyCollapse = forwardRef<HTMLDivElement, CollapseProps>(
  ({ children, in: inProp, onTransitionEnd, ...otherProps }, ref) => {
    const [isTransitioning, setIsTransitioning] = useState(false)
    const previousInRef = useRef(inProp)

    if (previousInRef.current !== inProp) {
      setIsTransitioning(true)
      previousInRef.current = inProp
    }

    return (
      <MantineCollapse
        ref={ref}
        in={inProp}
        {...otherProps}
        onTransitionEnd={() => {
          setIsTransitioning(false)
          onTransitionEnd?.()
        }}
      >
        {(inProp || isTransitioning) && children}
      </MantineCollapse>
    )
  }
)
