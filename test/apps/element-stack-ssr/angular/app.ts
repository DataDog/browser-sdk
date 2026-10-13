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
  @Input() description = 'Server-rendered API content'
  count = signal(0)
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef)
    afterNextRender(() => {
      window.registerPrototypeSource(new Error().stack, 'checkout-angular')
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
  @Input() description = 'Server-rendered property content'
  count = signal(0)
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef)
    afterNextRender(() => {
      window.registerPrototypeSource(new Error().stack, 'checkout-angular')
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
  @Input() description = 'Server-rendered attribute content'
  count = signal(0)
  stack = signal<string | undefined>(undefined)
  constructor() {
    afterNextRender(() => {
      const browserStack = new Error().stack
      window.registerPrototypeSource(browserStack, 'checkout-angular')
      this.stack.set(browserStack)
    })
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ApiBoundary, PropertyBoundary, AttributeBoundary],
  template: `<h1>Angular — element stack SSR prototype</h1>
    <p>All three sections are server-rendered. Registration runs only in browser render callbacks.</p>
    <api-boundary /><property-boundary /><attribute-boundary />`,
})
export class App {}
