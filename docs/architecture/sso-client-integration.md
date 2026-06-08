# Integracion SSO/Auth del cliente Gaceta

Gaceta consume Identity Hub como cliente OAuth 2.0 confidential con backend propio. El frontend Angular no intercambia authorization codes ni tokens directamente con Identity Hub: el backend NestJS inicia el login, recibe el callback, canjea el code, verifica el access token y mantiene la sesion local con cookies HTTP-only.

## Flujo principal

1. El navegador abre `GET /auth/login`.
2. Gaceta genera `state` y `code_verifier`.
3. Gaceta calcula `code_challenge = base64url(sha256(code_verifier))`.
4. Gaceta guarda temporalmente `state` y `code_verifier` en cookies HTTP-only.
5. Gaceta redirige a Identity Hub `/oauth/authorize` con `response_type=code`, `client_id`, `redirect_uri`, `state`, `code_challenge` y `code_challenge_method=S256`.
6. Identity Hub autentica al usuario y redirige a `GET /auth/callback` con `code` y `state`, o con `error` y `state`.
7. Gaceta valida el `state` antes de procesar tanto callbacks exitosos como callbacks con error.
8. Gaceta recupera el `code_verifier` temporal y canjea el `code` en `/oauth/token`.
9. Gaceta verifica el `accessToken` con JWKS, firma `RS256`, `issuer` y `audience`.
10. Gaceta sincroniza o carga el shadow user local usando `externalKey`.
11. Gaceta crea cookies locales HTTP-only `gazette_access` y `gazette_refresh`.

## PKCE S256

Identity Hub exige PKCE S256. Gaceta no soporta `plain`.

En authorize se envia:

- `code_challenge`
- `code_challenge_method=S256`

En token exchange se envia:

- `code_verifier`

El `code_verifier` se genera con entropia criptografica, cumple el formato PKCE permitido y vive solo durante el intento de login.

## Cookies

Cookies temporales del intento OAuth:

- `gazette_oauth_state`
- `gazette_pkce_verifier`

Ambas tienen TTL corto, `httpOnly=true`, `sameSite=lax`, `secure` controlado por `AUTH_COOKIE_SECURE` y path `/auth`.

Cookies locales de sesion:

- `gazette_access`
- `gazette_refresh`

Estas cookies contienen los tokens emitidos por Identity Hub y se reemplazan cuando el refresh rota. La decision actual de guardar `state` y `code_verifier` en cookies HTTP-only es simple y suficiente para este backend sin Redis. Si luego hay multiples instancias o mayor exigencia de seguridad, se puede migrar a Redis/cache server-side o a una cookie firmada/encriptada.

## Endpoints

- `GET /auth/login`: inicia OAuth y redirige a Identity Hub.
- `GET /auth/callback`: recibe `code/state` o `error/state` desde Identity Hub.
- `GET /api/auth/me`: devuelve el usuario autenticado local.
- `POST /api/auth/logout`: limpia cookies locales de Gaceta.

Las rutas OAuth de navegador viven fuera del prefijo global `/api`. Las APIs de sesion y administracion viven bajo `/api`.

## Token exchange y refresh

Para `authorization_code`, Gaceta llama a Identity Hub `/oauth/token` con:

- `grant_type=authorization_code`
- `client_id`
- `client_secret`
- `redirect_uri`
- `code`
- `code_verifier`

Para `refresh_token`, Gaceta conserva el flujo existente. Identity Hub usa refresh tokens rotativos, por lo que cada refresh exitoso devuelve un nuevo access token y un nuevo refresh token. Gaceta reemplaza ambas cookies locales inmediatamente.

## Verificacion JWT

Antes de aceptar el access token, Gaceta valida:

- JWKS publicado por Identity Hub.
- algoritmo `RS256`.
- `kid` en el header.
- `issuer` igual a `OAUTH_ISSUER`.
- `audience` igual a `OAUTH_CLIENT_ID`.
- expiracion del JWT.

Si el access token expiro y existe `gazette_refresh`, el guard intenta refresh silencioso. Si el refresh falla, limpia cookies y responde `401`.

## Usuarios y roles locales

Gaceta mantiene un shadow user local vinculado por `externalKey`. Ese valor es el identificador estable de integracion con Identity Hub.

Identity Hub decide identidad global y acceso a la aplicacion. Gaceta decide roles locales:

- `ADMIN`
- `USER`

La sincronizacion JIT actualiza datos descriptivos como `fullName`, pero no sobrescribe roles locales. Si el usuario no existe localmente durante el primer login, se crea con rol `USER`. El guard tambien exige que el usuario local este activo (`isActive=true`).

## Importacion y bootstrap admin

Un admin local puede importar usuarios asignables desde Identity Hub mediante:

- `GET /api/users/identity-candidates?term=`
- `GET /api/users/identity-candidates/:externalKey`
- `POST /api/users/import-from-identity`

Estas rutas estan protegidas por SSO y rol local `ADMIN`.

El primer admin local se crea con:

```bash
BOOTSTRAP_ADMIN_EXTERNAL_KEY=IDH-U-... npm run bootstrap:admin
```

El bootstrap usa `BOOTSTRAP_ADMIN_EXTERNAL_KEY`, consulta Identity Hub con `OAUTH_CLIENT_ID` y `OAUTH_CLIENT_SECRET`, no crea nada si ya existe un admin local y no promueve usuarios shadow existentes.

## Logout local y global

`POST /api/auth/logout` hace logout local de Gaceta:

- limpia `gazette_access`
- limpia `gazette_refresh`
- limpia cookies temporales OAuth si existieran

No cierra la sesion global de Identity Hub. Si el navegador sigue autenticado en Identity Hub, un nuevo `GET /auth/login` puede reingresar sin pedir credenciales. Un logout global del Hub debe tratarse como una accion separada.

## Variables de entorno

Variables SSO/Auth usadas:

- `IDENTITY_HUB_URL`: URL publica/navegable usada para redirects del navegador a `/oauth/authorize` y JWKS.
- `IDENTITY_HUB_INTERNAL_URL`: URL server-to-server para endpoints service-to-service `/internal/*`.
- `OAUTH_CLIENT_ID`: client id registrado en Identity Hub.
- `OAUTH_CLIENT_SECRET`: secreto del cliente confidential.
- `OAUTH_REDIRECT_URI`: callback exacto registrado, por ejemplo `http://localhost:7000/auth/callback`.
- `OAUTH_ISSUER`: valor esperado del claim `iss`.
- `AUTH_COOKIE_SECURE`: flag `Secure` de cookies.
- `DB_SYNCHRONIZE`: sincronizacion de esquema TypeORM en runtime; `true` solo local, `false` en staging/produccion.
- `GAZETTE_UI_BASE_URL`: frontend separado, opcional.
- `CORS_ORIGIN`: origen permitido para CORS cuando frontend y backend corren separados.
- `BOOTSTRAP_ADMIN_EXTERNAL_KEY`: solo para `npm run bootstrap:admin`.

En local `IDENTITY_HUB_URL` e `IDENTITY_HUB_INTERNAL_URL` pueden tener el mismo valor. En Docker, produccion o redes internas, `IDENTITY_HUB_URL` debe resolver desde el navegador y `IDENTITY_HUB_INTERNAL_URL` desde el backend de Gaceta.

No se requiere Redis, cache ni `AUTH_COOKIE_SECRET` para esta implementacion.

## Checklist manual breve

1. Abrir `GET /auth/login`.
2. Confirmar que la redireccion a Identity Hub incluye `state`, `code_challenge` y `code_challenge_method=S256`.
3. Confirmar que se crean `gazette_oauth_state` y `gazette_pkce_verifier` con path `/auth`.
4. Completar login en Identity Hub y volver a `GET /auth/callback`.
5. Confirmar que el callback limpia cookies temporales y crea `gazette_access` y `gazette_refresh`.
6. Llamar `GET /api/auth/me` y confirmar `200`.
7. Probar callback con `state` incorrecto y confirmar redireccion a error `invalid_state`.
8. Dejar expirar access token y confirmar refresh silencioso con reemplazo de cookies.
9. Llamar `POST /api/auth/logout` y confirmar que `/api/auth/me` responde `401`.
