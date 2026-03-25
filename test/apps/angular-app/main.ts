import 'zone.js'
import { Component } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter, RouterOutlet, RouterLink, type Routes } from '@angular/router'
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
    <a routerLink="/parameterized/42">Go to Parameterized Route</a><br />
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
  selector: 'app-parameterized-route',
  standalone: true,
  template: '<h1>Parameterized Route</h1>',
})
class ParameterizedRouteComponent {}

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
  imports: [RouterOutlet, RouterLink],
  template: `
    <nav>
      <a routerLink="/">Initial Route</a>
      <a routerLink="/parameterized/42">Parameterized Route</a>
    </nav>
    <router-outlet></router-outlet>
  `,
})
class AppComponent {}

// Routes
const nestedRoutes: Routes = [{ path: 'nested', component: NestedRouteComponent }]

const routes: Routes = [
  { path: '', component: InitialRouteComponent },
  { path: 'parameterized/:id', component: ParameterizedRouteComponent },
  { path: 'parent', loadChildren: () => Promise.resolve(nestedRoutes) },
  { path: '**', component: WildcardRouteComponent },
]

// Bootstrap - dynamically create root element (E2E framework serves bare HTML)
const rootElement = document.createElement('app-root')
document.body.appendChild(rootElement)

void bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideDatadogRouter(), provideDatadogErrorHandler()],
})
