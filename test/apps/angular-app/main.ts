// eslint-disable-next-line import/no-unresolved
import 'zone.js'
import { Component } from '@angular/core'
// eslint-disable-next-line import/no-unresolved
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter, RouterOutlet, RouterLink, type Routes } from '@angular/router'
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin, provideDatadogRouter } from '@datadog/browser-rum-angular'

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
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>Home</h1>
    <a routerLink="/user/42">Go to User</a><br />
    <a routerLink="/admin/settings">Go to Admin Settings</a>
  `,
})
class HomeComponent {}

@Component({
  selector: 'app-user',
  standalone: true,
  template: '<h1>User Page</h1>',
})
class UserComponent {}

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  template: '<h1>Admin Settings</h1>',
})
class AdminSettingsComponent {}

@Component({
  selector: 'app-not-found',
  standalone: true,
  template: '<h1>Not Found</h1>',
})
class NotFoundComponent {}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <nav>
      <a routerLink="/">Home</a>
      <a routerLink="/user/42">User</a>
    </nav>
    <router-outlet></router-outlet>
  `,
})
class AppComponent {}

// Routes
const adminRoutes: Routes = [{ path: 'settings', component: AdminSettingsComponent }]

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'user/:id', component: UserComponent },
  { path: 'admin', loadChildren: () => Promise.resolve(adminRoutes) },
  { path: '**', component: NotFoundComponent },
]

// Bootstrap - dynamically create root element (E2E framework serves bare HTML)
const rootElement = document.createElement('app-root')
document.body.appendChild(rootElement)
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
void bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideDatadogRouter()],
})
