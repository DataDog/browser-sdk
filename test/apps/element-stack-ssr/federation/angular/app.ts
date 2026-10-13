import '@angular/compiler'
import { Component } from '@angular/core'
import { ApiBoundary, PropertyBoundary, AttributeBoundary } from '../../angular/app'
@Component({
  selector: 'federated-angular',
  standalone: true,
  imports: [ApiBoundary, PropertyBoundary, AttributeBoundary],
  template:
    '<api-boundary idPrefix="angular-" description="Client-rendered Angular boundary." /><property-boundary idPrefix="angular-" description="The MFE captures this stack directly." /><attribute-boundary idPrefix="angular-" description="Set in the browser when mounted." />',
})
export class App {}
