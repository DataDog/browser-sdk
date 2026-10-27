import { Component, ElementRef, Input, afterNextRender, inject, signal } from '@angular/core'
import type {} from '../browser'

@Component({
  selector: 'api-boundary',
  standalone: true,
  host: { '[id]': "idPrefix + 'api-root'" },
  template: `<h2>SDK API</h2>
    <p data-server-content="api">{{ description }}</p>
    <button [id]="idPrefix + 'api-click'" (click)="count.set(count() + 1)">API click</button
    ><output>{{ count() }}</output>`,
})
export class ApiBoundary {
  @Input() idPrefix = ''
  @Input() description = 'API boundary'
  count = signal(0)
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef)
    afterNextRender(() => {
      window.DD_RUM.attachElementStack(host.nativeElement)
    })
  }
}

@Component({
  selector: 'property-boundary',
  standalone: true,
  host: { '[id]': "idPrefix + 'property-root'" },
  template: `<h2>Custom property</h2>
    <p data-server-content="property">{{ description }}</p>
    <button [id]="idPrefix + 'property-click'" (click)="count.set(count() + 1)">Property click</button
    ><output>{{ count() }}</output>`,
})
export class PropertyBoundary {
  @Input() idPrefix = ''
  @Input() description = 'Property boundary'
  count = signal(0)
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef)
    afterNextRender(() => {
      host.nativeElement.dd_element_stack = new Error().stack
    })
  }
}

@Component({
  selector: 'attribute-boundary',
  standalone: true,
  template: `<section [id]="idPrefix + 'attribute-root'" [attr.data-dd-element-stack]="stack()">
    <h2>DOM attribute</h2>
    <p data-server-content="attribute">{{ description }}</p>
    <button [id]="idPrefix + 'attribute-click'" (click)="count.set(count() + 1)">Attribute click</button
    ><output>{{ count() }}</output>
  </section>`,
})
export class AttributeBoundary {
  @Input() idPrefix = ''
  @Input() description = 'Attribute boundary'
  count = signal(0)
  stack = signal<string | undefined>(undefined)
  constructor() {
    afterNextRender(() => {
      const browserStack = new Error().stack
      this.stack.set(browserStack)
    })
  }
}
