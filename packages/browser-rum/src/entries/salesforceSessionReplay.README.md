# Session Replay en Salesforce LWC

## Conclusión

No: subir un único bundle que contenga RUM y Session Replay y cargarlo desde un LWC con `loadScript` no es suficiente para tener Session Replay completo en una Lightning App que se ejecuta bajo Lightning Web Security (LWS).

Un bundle único resuelve solamente una parte del problema: evita que el SDK tenga que descargar el recorder como un chunk adicional. Todavía quedan dos bloqueos fundamentales:

1. Session Replay necesita crear un Web Worker para comprimir y codificar los registros. LWS bloquea el constructor `Worker`.
2. Session Replay necesita observar y serializar el DOM completo, incluidos cambios, eventos y Shadow DOM. LWS limita cada sandbox al DOM que le pertenece, por lo que un SDK cargado desde un LWC no puede ver fielmente toda la página de Salesforce.

Por tanto:

| Forma de carga | Session Replay completo |
| --- | --- |
| LWC normal mediante `loadScript`, bajo LWS | No |
| Bundle único RUM + recorder, bajo LWS | No |
| LWC con el SDK ejecutándose fuera de LWS mediante Trusted Mode | Posiblemente, sujeto a disponibilidad y validación |
| Experience Cloud mediante Head Markup, fuera del sandbox del componente | Posiblemente, sujeto a CSP y validación |
| Recorder limitado al DOM del propio componente | Parcial; no representa la página completa |

## Estado actual del bundle de Salesforce

El bundle actual de Salesforce se construye desde `browser-rum-slim`. Esa versión usa un stub de la API del recorder y no incluye Session Replay. En consecuencia, configurar `sessionReplaySampleRate: 100` no activa el recorder.

El entrypoint experimental [`salesforceSessionReplay.ts`](./salesforceSessionReplay.ts) importa `startRecording` de forma estática y se lo entrega a `makeRecorderApi`. Esto permite incluir RUM y el recorder en el mismo archivo JavaScript, en lugar de cargar el recorder de forma dinámica.

Esto soluciona el empaquetado, pero no las restricciones de ejecución de LWS.

## Por qué el bundle completo normal tampoco basta

El bundle estándar `datadog-rum.js` no es, en la práctica, un único recurso para Session Replay. El SDK carga el recorder dinámicamente desde un chunk `datadogRecorder-...-datadog-rum.js` cuando tiene que comenzar la grabación.

Hay dos maneras de evitar esa descarga adicional:

- Publicar el bundle principal y el chunk dentro de un Static Resource ZIP, manteniendo las rutas esperadas.
- Crear un entrypoint específico, como `salesforceSessionReplay.ts`, que importe el recorder estáticamente y genere un solo archivo JavaScript.

Ninguna de las dos opciones evita el uso del Web Worker ni amplía la visibilidad del DOM dentro de LWS.

## Web Worker obligatorio

Session Replay inicia un encoder Deflate mediante:

```ts
new Worker(configuration.workerUrl || URL.createObjectURL(new Blob([__BUILD_ENV__WORKER_STRING__])))
```

El worker se usa para comprimir y codificar los registros de replay antes de enviarlos. La opción `compressIntakeRequests` afecta a la compresión de las peticiones RUM normales, pero no elimina este worker obligatorio de Session Replay.

Según el [LWS Distortion Viewer para `Worker`](https://developer.salesforce.com/tools/lws-distortion-viewer#Worker_constructor-value), LWS reemplaza el constructor por una función que siempre lanza una excepción. Configurar `workerUrl` tampoco lo evita, porque el bloqueo ocurre al invocar `new Worker(...)`, independientemente de la URL.

Para ejecutar Session Replay dentro de un LWC normal sería necesario desarrollar un encoder alternativo en el hilo principal o conseguir que Salesforce permita el worker. Un encoder en el hilo principal podría resolver este bloqueo técnico, pero añadiría coste de CPU a la UI y seguiría sin resolver la falta de acceso al DOM completo.

## APIs del DOM que Session Replay usa y LWS restringe

Session Replay no captura vídeo. Construye un snapshot del DOM, observa sus cambios y registra eventos para reconstruir posteriormente la página. Para ello depende de APIs cuya semántica cambia dentro de LWS.

| API o capacidad | Uso en Session Replay | Restricción de LWS | Impacto |
| --- | --- | --- | --- |
| `Worker` | Compresión y codificación de los registros | El constructor está bloqueado | El recorder no puede inicializar su encoder |
| Recorrido y serialización del documento | Snapshot inicial de toda la página | Un sandbox solo puede acceder al DOM que le pertenece | Snapshot incompleto de la aplicación Salesforce |
| `MutationObserver` | Registrar altas, bajas y cambios de nodos y atributos | LWS restringe la observación de nodos compartidos como `html`, `head` y `body`, y mantiene el aislamiento entre sandboxes | No se observan de forma fiable los cambios fuera del namespace del LWC |
| `Element.shadowRoot` | Descubrir y serializar Shadow DOM abierto | Devuelve `null` cuando el Shadow DOM pertenece a otro sandbox | Faltan componentes Lightning y de otros namespaces |
| `Node.getRootNode()` y `Node.parentNode` | Reconstruir jerarquías y atravesar límites de Shadow DOM | LWS oculta un `ShadowRoot` ajeno | La estructura reconstruida pierde límites y nodos |
| `Event.composedPath()` y `Event.target` | Determinar el elemento real de clicks, inputs y otros eventos | El path se recorta y el target se retargetea al cruzar límites protegidos | Las interacciones pueden asociarse al host o perder el elemento interior |
| Instrumentación de prototipos DOM/CSSOM/input/canvas | Capturar cambios que no siempre aparecen como mutaciones normales | Cada sandbox tiene su propio entorno y sus propios objetos distorsionados | La instrumentación instalada por un LWC no observa necesariamente operaciones de otros sandboxes |

Referencias directas del Distortion Viewer:

- [`MutationObserver.observe`](https://developer.salesforce.com/tools/lws-distortion-viewer#MutationObserver_observe-value)
- [`Element.shadowRoot`](https://developer.salesforce.com/tools/lws-distortion-viewer#Element_shadowroot-getter)
- [`Node.getRootNode`](https://developer.salesforce.com/tools/lws-distortion-viewer#Node_getrootnode-value)
- [`Node.parentNode`](https://developer.salesforce.com/tools/lws-distortion-viewer#Node_parentnode-getter)
- [`Event.composedPath`](https://developer.salesforce.com/tools/lws-distortion-viewer#Event_composedpath-value)

Estas restricciones son deliberadas. Salesforce explica que el aislamiento de DOM impide que un componente acceda a elementos que no posee, y menciona específicamente que las librerías de analítica necesitan acceso al documento completo: [DOM Access Containment](https://developer.salesforce.com/docs/platform/lightning-components-security/guide/locker-dom.html) y [Third-Party Analytics Libraries](https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-analytics.html).

Además, incluso fuera de LWS, Datadog solo soporta Shadow DOM abierto. Los shadow roots nativos cerrados no se pueden grabar: [Datadog Shadow DOM Support](https://docs.datadoghq.com/real_user_monitoring/guide/shadow-dom/).

## Opciones viables

### 1. LWS Trusted Mode

Trusted Mode es la única vía razonable para obtener Session Replay completo en una Lightning App estándar. Permite que un script de terceros aprobado se ejecute fuera de las restricciones de LWS y exponga únicamente globals concretos al componente, por ejemplo `DD_RUM`.

Si está disponible en la organización:

1. Subir el bundle como Static Resource.
2. Configurarlo para cargarse en Trusted Mode.
3. Exponer `DD_RUM` al sandbox del LWC.
4. Permitir el endpoint de intake de Datadog mediante `connect-src`.
5. Inicializar RUM con Session Replay.
6. Validar el comportamiento del worker con la CSP real de la organización.

Fuera de LWS, el bundle podría acceder al DOM completo y crear un worker. Si la CSP del navegador no permite un worker creado desde `blob:`, se puede publicar `worker.js` como recurso estático del mismo origen y configurar `workerUrl`.

La disponibilidad es el problema principal: Salesforce introdujo Trusted Mode como beta y posteriormente dejó de habilitarlo para nuevos clientes. Por ello hay que comprobar si la organización ya tiene acceso o si Salesforce puede habilitarlo antes de invertir en esta integración:

- [Trusted Mode release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_lc_lws_trusted_mode.htm&language=en_US&release=258&type=5)
- [Trusted Mode discontinued for new customers](https://help.salesforce.com/s/articleView?id=release-notes.rn_lc_lws_trusted_mode_discontinued.htm&language=en_US&release=260&type=5)

### 2. Experience Cloud Head Markup

En Experience Cloud se puede cargar el SDK desde Head Markup, fuera del sandbox de un componente LWC. Salesforce documenta esta opción como workaround para librerías de analítica que necesitan acceso a la página completa.

Esta vía no sirve para una Lightning App estándar. También requiere:

- Un nivel de CSP que permita el script.
- `connect-src` hacia el intake de Datadog.
- Resolver la carga del recorder mediante chunk, ZIP o bundle estático.
- Permitir `blob:` para el worker o publicar `worker.js` y usar `workerUrl`.

### 3. Replay limitado al componente

Otra posibilidad sería modificar el recorder para que acepte como raíz únicamente el template del LWC y reemplazar el worker por un encoder en el hilo principal.

El resultado no sería un Session Replay de Salesforce: solo mostraría el DOM que pertenece a ese componente y omitiría navegación, shell de Lightning, componentes estándar y componentes de otros namespaces. También requeriría mantener un fork importante del recorder. Solo tendría sentido si se presenta explícitamente como una captura parcial del componente.

## Prueba de concepto recomendada

1. Comprobar primero si la organización dispone de LWS Trusted Mode. Si no lo tiene, no hay una ruta viable para Session Replay completo en una Lightning App estándar.
2. Construir el entrypoint de Salesforce con el recorder importado estáticamente para evitar el chunk dinámico.
3. Cargar ese recurso fuera de LWS mediante Trusted Mode. Para Experience Cloud, usar Head Markup.
4. Configurar el endpoint de intake de Datadog como Trusted URL para `connect-src`.
5. Inicializar con una configuración equivalente a:

```js
window.DD_RUM.init({
  applicationId: '<APPLICATION_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: 'mask',
  trackViewsManually: true,
  trackUserInteractions: true,
  trackResources: true,
  trackLongTasks: true,
})
```

6. Si falla el worker creado desde `blob:`, publicar el worker como Static Resource del mismo origen y pasar su URL mediante `workerUrl`.
7. Validar en una organización real, con su CSP real:
   - Que no haya errores de inicialización del recorder o del worker.
   - Que se envíen peticiones de replay al intake.
   - Que el snapshot contenga tanto componentes propios como componentes estándar de Salesforce.
   - Que clicks, inputs, navegación y cambios dinámicos se reproduzcan correctamente.
   - Que el recorder siga funcionando después de navegar entre vistas de la SPA.

Las pruebas E2E existentes de Salesforce no demuestran compatibilidad con Session Replay porque desactivan o evitan restricciones de CSP y no validan payloads de replay. La prueba definitiva tiene que hacerse en una organización Salesforce real sin esas excepciones.

## Otra diferencia detectada: `PerformanceObserver`

El Distortion Viewer actual indica que LWS bloquea `PerformanceObserver.observe()` para tipos como `resource`, `navigation`, `longtask`, `element`, `layout-shift`, `largest-contentful-paint`, `first-input` y `event`: [`PerformanceObserver.observe`](https://developer.salesforce.com/tools/lws-distortion-viewer#PerformanceObserver_observe-value).

Esto entra en conflicto con la matriz de soporte actual del bundle Salesforce, que marca navegación, Web Vitals, recursos y long tasks como soportados, y con algunas pruebas existentes. Probablemente exista una diferencia entre versiones de LWS o entre el entorno de prueba y una organización real. No es un bloqueo específico de Session Replay, pero conviene volver a validar esas señales en la versión exacta de Salesforce objetivo.

## Resumen

El entrypoint con RUM y recorder en un solo bundle es necesario para simplificar la distribución, pero no hace que Session Replay sea compatible con un LWC normal. Bajo LWS siguen bloqueados el Web Worker y el acceso transversal al DOM.

La solución técnicamente correcta es ejecutar el SDK fuera de LWS mediante Trusted Mode, si la organización tiene acceso, o mediante Head Markup en Experience Cloud. Sin una de esas vías, como máximo puede construirse un replay parcial del propio componente, no una reproducción fiel de la aplicación Salesforce.
