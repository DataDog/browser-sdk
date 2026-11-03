import { Component, ErrorHandler, inject, input, PLATFORM_ID } from '@angular/core'
import { isPlatformServer } from '@angular/common'
import { Routes } from '@angular/router'

@Component({ template: '<h1>Home</h1>' })
class HomePage {}

@Component({ template: '<h1>User {{ id() }}</h1>' })
class UserPage {
  readonly id = input<string>()
}

// Reports an error through the application's ErrorHandler during server rendering, as Angular does
// for errors in effects, event listeners, HTTP callbacks...
@Component({ template: '<h1>SSR error</h1>' })
class SsrErrorPage {
  constructor() {
    if (isPlatformServer(inject(PLATFORM_ID))) {
      inject(ErrorHandler).handleError(new Error('Angular error during server rendering'))
    }
  }
}

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'user/:id', component: UserPage },
  { path: 'ssr-error', component: SsrErrorPage },
]
