import 'zone.js'
import { Component, inject } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter, RouterOutlet, RouterLink, ActivatedRoute, type Routes } from '@angular/router'
import { NgIf } from '@angular/common'
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin, provideDatadogRouter, provideDatadogErrorHandler } from '@datadog/browser-rum-angular'

declare global {
  interface Window {
    RUM_CONFIGURATION?: any
    RUM_CONTEXT?: any
  }
}

// Initialize RUM before bootstrap
datadogRum.init({ ...window.RUM_CONFIGURATION, plugins: [angularPlugin({ router: true })] })
if (window.RUM_CONTEXT) {
  datadogRum.setGlobalContext(window.RUM_CONTEXT)
}

// Components

@Component({
  selector: 'app-initial-route',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Initial Route</h1>
    <a routerLink="/user/42" [queryParams]="{ admin: 'true' }">Go to User 42</a><br />
    <a routerLink="/guides/123">Go to Guides 123</a><br />
    <a routerLink="/error-test">Go to Error Test</a><br />
    <a routerLink="/parent/nested">Go to Nested Route</a><br />
    <a routerLink="/unknown/page">Go to Wildcard Route</a><br />
    <button id="throw-error" (click)="throwError()">Throw Error</button>
    <button id="throw-error-with-context" (click)="throwErrorWithContext()">Throw Error With Context</button>
  `,
})
class InitialRouteComponent {
  throwError() {
    throw new Error('angular error from component')
  }

  throwErrorWithContext() {
    const error = new Error('angular error with dd_context')
    ;(error as any).dd_context = { component: 'InitialRoute', userId: 42 }
    throw error
  }
}

@Component({
  selector: 'app-user-route',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>User Page</h1>
    <a routerLink="/">Back to Home</a><br />
    <a [routerLink]="['/user', id]" fragment="section">Go to Section</a><br />
    <a [routerLink]="['/user', id]" [queryParams]="{ admin: 'false' }">Change query params</a><br />
    <a [routerLink]="['/user', '999']" [queryParams]="{ admin: 'true' }">Go to User 999</a>
  `,
})
class UserRouteComponent {
  protected id = inject(ActivatedRoute).snapshot.params['id'] as string
}

@Component({
  selector: 'app-guides-route',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Guides</h1>
    <a routerLink="/">Back to Home</a>
  `,
})
class GuidesRouteComponent {}

@Component({
  selector: 'app-error-test-route',
  standalone: true,
  imports: [NgIf],
  template: `
    <h1>Error Test</h1>
    <button data-testid="trigger-error" (click)="triggerError()">Trigger Error</button>
    <div *ngIf="hasError" data-testid="error-boundary">Error occurred</div>
  `,
})
class ErrorTestRouteComponent {
  hasError = false

  triggerError() {
    this.hasError = true
    throw new Error('Error triggered by button click')
  }
}

@Component({
  selector: 'app-nested-route',
  standalone: true,
  template: '<h1>Nested Route</h1>',
})
class NestedRouteComponent {}

@Component({
  selector: 'app-wildcard-route',
  standalone: true,
  template: '<h1>Wildcard Route</h1>',
})
class WildcardRouteComponent {}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class AppComponent {}

// Routes
const nestedRoutes: Routes = [{ path: 'nested', component: NestedRouteComponent }]

const routes: Routes = [
  { path: '', component: InitialRouteComponent },
  { path: 'user/:id', component: UserRouteComponent },
  { path: 'guides/:slug', component: GuidesRouteComponent },
  { path: 'error-test', component: ErrorTestRouteComponent },
  { path: 'parent', loadChildren: () => Promise.resolve(nestedRoutes) },
  { path: '**', component: WildcardRouteComponent },
]

// Bootstrap - dynamically create root element (E2E framework serves bare HTML)
const rootElement = document.createElement('app-root')
document.body.appendChild(rootElement)

void bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideDatadogRouter(), provideDatadogErrorHandler()],
})
