import { bootstrapApplication } from '@angular/platform-browser'
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin } from '@datadog/browser-rum-angular'
import { appConfig } from './app/app.config'
import { App } from './app/app'

// ex: localhost:4000?rum-config={"applicationId":"123","clientToken":"456","site":"datadoghq.com"}
const rumConfig = new URLSearchParams(window.location.search).get('rum-config')
if (rumConfig) {
  datadogRum.init({ ...JSON.parse(rumConfig), plugins: [angularPlugin({ router: true })] })
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err))
