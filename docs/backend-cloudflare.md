# Backend mínimo en Cloudflare Workers

Trazo es una app estática (GitHub Pages). Casi todo pasa en el navegador: el editor, el layout y las bibliotecas Git, que hablan directamente con la API de GitHub. Solo dos cosas necesitan un servidor, y para eso está `packages/worker`:

1. **Iniciar sesión con GitHub.** Al volver del login, GitHub entrega un código que hay que canjear por un token. Ese canje pide el *client secret* de la GitHub App, que no puede ir en el JavaScript, y el endpoint de GitHub no admite llamadas desde el navegador (no envía cabeceras CORS). El Worker hace solo ese canje y la renovación. **No ve los diagramas**: después, la app usa el token directamente contra `api.github.com`.
2. **Galería pública.** Permite navegar, sin cuenta de GitHub, las arquitecturas de los repos que elijas. El Worker las lee con la GitHub App en solo lectura y las cachea en el borde de Cloudflare, así los visitantes no gastan cuota de la API.

El token personal (PAT) sigue funcionando como alternativa sin backend, y GitLab no necesita el Worker porque admite PKCE desde el navegador.

## Endpoints

| Método y ruta | Qué hace |
|---|---|
| `GET /health` | `{ ok, oauth, gallery }`: qué partes están configuradas. |
| `GET /auth/github/login?return_to=<url de la app>` | Redirige a GitHub. Guarda `state` y el verificador PKCE en una cookie `HttpOnly` de 10 minutos. |
| `GET /auth/github/callback` | Canjea el código y devuelve la sesión a la app (ver más abajo). |
| `POST /auth/github/refresh` `{ "refresh_token": "…" }` | Token nuevo. Los de una GitHub App caducan a las 8 horas. |
| `POST /auth/github/logout` `{ "access_token": "…" }` | Revoca el token. |
| `GET /gallery` | `{ repos: ["owner/repo", …] }`. |
| `GET /gallery/:owner/:repo?ref=<rama o sha>` | Índice: `{ repo, ref, commit, architectures: [{ path, model, views, assets }] }`. Caché de 60 s. |
| `GET /gallery/:owner/:repo/files/<ruta>?ref=<sha>` | Un fichero de ese commit (`.yaml`, `.yml`, `.json`, `.md`, `.svg`, `.png`). Caché de 1 día. |

Una arquitectura es una carpeta con un `*.calm.yaml` y sus vistas en `views/*.view.yaml`, igual que en `examples/`.

Las llamadas desde el navegador solo se aceptan desde los orígenes de `ALLOWED_ORIGINS`, y `return_to` también tiene que estar en esa lista. Así nadie puede usar tu Worker para recoger tokens en otra web.

### Cómo recibe la app la sesión

La app navega a `/auth/github/login?return_to=<url actual>`. Al volver, el Worker:

- si el login se abrió en una ventana emergente, hace `window.opener.postMessage({ type: 'trazo:github-auth', session }, <origen de la app>)` y cierra la ventana;
- si no, redirige a `return_to#trazo-auth=<JSON>`. El fragmento `#` nunca llega a ningún servidor; la app lo lee, lo borra con `history.replaceState` y guarda la sesión.

`session` es `{ accessToken, expiresAt, refreshToken, refreshTokenExpiresAt, user: { login, name, avatarUrl } }`, con fechas en milisegundos. Si algo falla llega `{ type: 'trazo:github-auth', error: '<código>' }`.

Recomiendo la redirección de página completa como opción por defecto: GitHub puede cortar la relación con la ventana emergente y la app ya guarda el trabajo en el navegador, así que no se pierde nada. La app debe renovar el token un poco antes de `expiresAt` con `/auth/github/refresh`.

## Puesta en marcha

Necesitas hacerlo una sola vez. Los pasos 1 a 3 dejan el despliegue automático funcionando; los pasos 4 a 6 activan el login y la galería.

### 1. Token de Cloudflare con el mínimo permiso

1. En el panel de Cloudflare copia tu **Account ID** (Workers & Pages → panel derecho de *Overview*).
2. Si nunca has usado Workers, entra una vez en **Workers & Pages** para que Cloudflare te asigne el subdominio `<tu-subdominio>.workers.dev`.
3. Ve a **Mi perfil → API Tokens → Create Token → Create Custom Token** y configura:
   - **Permissions:** `Account` → `Workers Scripts` → `Edit`. Nada más.
   - **Account Resources:** `Include` → solo tu cuenta.
   - **TTL:** pon una fecha de caducidad (por ejemplo, 6 meses) y apúntate rotarlo.
   - *Client IP Address Filtering* no sirve aquí: los runners de GitHub cambian de IP.
4. Copia el token. Solo se muestra una vez.

Si el primer despliegue fallase por permisos al activar `workers.dev`, añade `Account` → `Account Settings` → `Read` al mismo token.

### 2. Entorno protegido en GitHub

En el repo `salvamiguel/trazo`: **Settings → Environments → New environment** → `cloudflare`.

- **Deployment branches and tags:** *Selected branches* → `main`. Así una rama o un PR no pueden leer el token.
- **Environment secrets:**
  - `CLOUDFLARE_API_TOKEN`: el token del paso 1.
  - `CLOUDFLARE_ACCOUNT_ID`: tu Account ID.
- Opcional: **Required reviewers** → tú, si quieres aprobar cada despliegue a mano.

### 3. Primer despliegue

El workflow [`.github/workflows/worker.yml`](../.github/workflows/worker.yml) hace dos cosas:

- en cada PR que toca `packages/worker`: typecheck, tests y `wrangler deploy --dry-run` (sin tocar Cloudflare);
- en cada push a `main` que toca el Worker: lo mismo y después `wrangler deploy`.

Para el primero, lánzalo a mano: **Actions → Worker (Cloudflare) → Run workflow** sobre `main`. Al terminar, el Worker estará en `https://trazo-api.<tu-subdominio>.workers.dev`. Comprueba `…/health`: dirá `"oauth": false` hasta completar el paso 5.

### 4. GitHub App para el login

**GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**:

| Campo | Valor |
|---|---|
| GitHub App name | `Trazo` (o `Trazo NTT DATA`; tiene que ser único en GitHub) |
| Homepage URL | `https://salvamiguel.github.io/trazo/` |
| Callback URL | `https://trazo-api.<tu-subdominio>.workers.dev/auth/github/callback`. Añade también `http://localhost:8787/auth/github/callback` para desarrollo local. |
| Expire user authorization tokens | Marcado (viene así por defecto) |
| Request user authorization (OAuth) during installation | Sin marcar |
| Enable Device Flow | Sin marcar |
| Webhook → Active | **Sin marcar** (el Worker no recibe webhooks) |
| Repository permissions | `Contents`: Read and write · `Pull requests`: Read and write · `Metadata`: Read-only (obligatorio) |
| Where can this GitHub App be installed? | *Only on this account*. Cambia a *Any account* cuando otras organizaciones quieran conectar su biblioteca. |

Después de crearla:

- Copia el **Client ID** (empieza por `Iv23…`).
- Pulsa **Generate a new client secret** y cópialo.
- Solo para la galería: copia el **App ID** y pulsa **Generate a private key** (se descarga un `.pem`).
- **Install App** → tu cuenta → *Only select repositories* → los repos que sean bibliotecas. Cada empresa o equipo instala la App en sus repos; con eso decide su administrador a qué tiene acceso Trazo.

Con una GitHub App, cada persona solo pulsa «Iniciar sesión con GitHub», los commits y PR quedan a su nombre, y Trazo nunca puede tocar más de lo que permiten a la vez la instalación y los permisos de esa persona.

### 5. Secretos del Worker (en Cloudflare, no en GitHub)

El *client secret* y la clave privada se guardan solo en Cloudflare. Así no viajan por GitHub Actions y `wrangler deploy` los conserva entre despliegues.

En el panel: **Workers & Pages → trazo-api → Settings → Variables and Secrets → Add**, tipo **Secret**:

- `GH_CLIENT_SECRET`: el client secret.
- `GH_APP_PRIVATE_KEY` (solo galería): el contenido completo del `.pem`, incluidas las líneas `-----BEGIN…` y `-----END…`. Vale tal cual lo da GitHub (PKCS#1).

O desde tu terminal, con `pnpm exec wrangler login` hecho antes:

```sh
cd packages/worker
pnpm exec wrangler secret put GH_CLIENT_SECRET
pnpm exec wrangler secret put GH_APP_PRIVATE_KEY < ~/Downloads/trazo.private-key.pem
```

### 6. Variables del repo

En **Settings → Secrets and variables → Actions → Variables** (no son secretos):

| Variable | Valor | Obligatoria |
|---|---|---|
| `TRAZO_GH_CLIENT_ID` | Client ID de la App | Para el login |
| `TRAZO_ALLOWED_ORIGINS` | Orígenes de la app separados por comas. Por defecto `https://salvamiguel.github.io,http://localhost:5173` | No |
| `TRAZO_GH_APP_ID` | App ID | Para la galería |
| `TRAZO_GALLERY_REPOS` | Repos de la galería, por ejemplo `salvamiguel/trazo`. Vacío desactiva la galería. | Para la galería |

Vuelve a lanzar el workflow. `…/health` debería decir `"oauth": true` (y `"gallery": true` si configuraste la galería).

Las variables normales se fijan en cada despliegue: si las cambias en el panel de Cloudflare, el siguiente despliegue las sobrescribe. Cámbialas aquí.

**Ojo con la galería:** cualquiera con la URL del Worker puede leer las arquitecturas de los repos de `TRAZO_GALLERY_REPOS`, aunque el repo sea privado. Pon ahí solo lo que quieras publicar, o protege la ruta `/gallery` con Cloudflare Access si la galería es interna.

## ¿Y OIDC?

Lo ideal sería que GitHub Actions se autenticase en Cloudflare con OIDC, sin ningún token guardado, como se hace con AWS o Azure. **Cloudflare todavía no lo admite**: su API no confía en el emisor OIDC de GitHub, y la petición sigue abierta en [cloudflare/workers-sdk#11434](https://github.com/cloudflare/workers-sdk/discussions/11434) y [wrangler-action#402](https://github.com/cloudflare/wrangler-action/issues/402). Por eso este repo usa la opción que recomienda Cloudflare: un token de alcance mínimo, con caducidad, en un entorno de GitHub que solo `main` puede leer.

Si no quieres ningún token de Cloudflare en GitHub, hay una federación real entre cuentas: **Workers Builds**. Cloudflare instala su propia GitHub App en el repo y despliega en cada push a `main`, sin secretos en GitHub. Se configura en **Workers & Pages → trazo-api → Settings → Build → Connect** con:

- Root directory: `packages/worker`
- Build command: `pnpm install --frozen-lockfile`
- Deploy command: `pnpm exec wrangler deploy`
- Las variables del paso 6 como *Build variables* en Cloudflare.

En ese caso, quita el job `deploy` del workflow para no desplegar dos veces; el job `check` sigue validando los PR. El inconveniente es que el despliegue ya no lo hace GitHub Actions: su historial y sus logs se ven en Cloudflare, no en la pestaña Actions.

Existen también *brokers* OIDC de la comunidad (por ejemplo [cf-oidc-auth](https://github.com/cf-contrib/cf-oidc-auth)): un Worker propio que verifica el token OIDC de Actions y emite un token de Cloudflare de corta duración. Son proyectos sin versión 1.0 y el broker necesita a su vez un token potente, así que no los recomiendo para esto.

## Desarrollo local

```sh
cp packages/worker/.dev.vars.example packages/worker/.dev.vars   # rellena GH_CLIENT_ID y GH_CLIENT_SECRET
pnpm --filter @trazo/worker dev      # http://localhost:8787
pnpm --filter @trazo/worker test
```

`.dev.vars` está en `.gitignore`. La callback local `http://localhost:8787/auth/github/callback` tiene que estar entre las de la GitHub App (paso 4).

## Coste

El plan gratuito de Workers incluye 100 000 peticiones al día. El login hace 2 peticiones por persona y la renovación 1 cada 8 horas; la galería se sirve casi siempre desde la caché.
