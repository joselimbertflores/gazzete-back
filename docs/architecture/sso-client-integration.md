# Integración SSO/Auth del cliente Gaceta

Este documento describe cómo **Gaceta** consume el **Identity Hub** como cliente OAuth 2.0. No reemplaza la documentación general del flujo OAuth/SSO del Identity Hub. La teoría del protocolo, el ciclo completo de autenticación y las decisiones del IdP deben consultarse en el proyecto **Identity Hub**.

## Alcance

- Gaceta es un **cliente OAuth confidential server-side**.
- El frontend Angular **no** intercambia tokens directamente con Identity Hub.
- El backend NestJS de Gaceta inicia el flujo, recibe el callback, intercambia el `code`, verifica tokens y mantiene la sesión local con cookies HTTP-only.

## Resumen del flujo

1. El navegador entra a `GET /auth/login`.
2. Gaceta genera un `state`, lo guarda en la cookie `gazette_oauth_state` y redirige al usuario a Identity Hub.
3. Identity Hub autentica al usuario y redirige a `GET /auth/callback` con `code` y `state`, o con `error`.
4. Gaceta valida que el `state` del callback coincida con la cookie `gazette_oauth_state`.
5. Si el callback es válido, Gaceta intercambia el `code` por tokens contra Identity Hub.
6. Gaceta verifica el `accessToken` con JWKS, firma `RS256`, `issuer` y `audience`.
7. Gaceta sincroniza o carga el shadow user local usando `externalKey`.
8. Gaceta guarda la sesión local en cookies HTTP-only `gazette_access` y `gazette_refresh`.
9. Las APIs protegidas usan la sesión local de Gaceta. El frontend nunca habla con Identity Hub para renovar o validar tokens.

## Rutas principales

- `GET /auth/login`
  Inicia el flujo OAuth y redirige al navegador a Identity Hub.

- `GET /auth/callback`
  Recibe `code/state` o `error` desde Identity Hub.

- `GET /api/auth/me`
  Devuelve el usuario autenticado a partir de la sesión local de Gaceta.

- `POST /api/auth/logout`
  Hace logout local del cliente Gaceta limpiando sus cookies.

## Cookies locales

Gaceta usa tres cookies HTTP-only:

- `gazette_oauth_state`
  Se usa solo durante el login OAuth para validar el callback.

- `gazette_access`
  Contiene el access token emitido por Identity Hub y usado por Gaceta para autenticar requests.

- `gazette_refresh`
  Contiene el refresh token emitido por Identity Hub y usado por Gaceta para renovar la sesión local cuando corresponde.

Configuración relevante actual:

- `httpOnly: true`
- `sameSite: 'lax'`
- `secure` controlado por `AUTH_COOKIE_SECURE`
- `path: '/'`

## Tokens recibidos desde Identity Hub

La respuesta del token endpoint usa **camelCase** por contrato:

- `accessToken`
- `refreshToken`
- `accessTokenExpiresIn`
- `refreshTokenExpiresIn`
- `tokenType`

Ese contrato es intencional y Gaceta lo consume así.

## Verificación del access token

Antes de usar el `accessToken`, Gaceta lo valida con:

- JWKS obtenido desde Identity Hub
- algoritmo `RS256`
- `kid` en el header JWT
- `issuer` configurado en `OAUTH_ISSUER`
- `audience` igual a `OAUTH_CLIENT_ID`

Si esa validación falla, la request no se considera autenticada.

## Shadow user local

Gaceta no usa directamente el usuario remoto del Identity Hub como modelo de aplicación. Mantiene un **shadow user** local:

- clave de correlación: `externalKey`
- alta automática si el usuario no existe localmente
- sincronización básica del `fullName`

El shadow user local permite que Gaceta mantenga roles y decisiones propias del dominio sin depender de consultas remotas en cada request.

## Protección de APIs

La protección principal está a cargo del `OAuthGuard` global.

Comportamiento actual:

1. Intenta autenticar usando `gazette_access`.
2. Si el `accessToken` es válido, carga el usuario local y la request continúa.
3. Si el `accessToken` falló por una causa recuperable, por ejemplo expiración, intenta renovar usando `gazette_refresh`.
4. Si el refresh funciona, actualiza `gazette_access` y `gazette_refresh`.
5. Si el refresh falla, limpia cookies auth y devuelve `401`.
6. Si el `accessToken` es estructuralmente inválido o no verificable, la sesión se rechaza y no se intenta recuperación silenciosa.

Eso significa que Gaceta distingue entre:

- sesión expirada que puede reintentarse con refresh
- sesión inválida que debe forzar nuevo login

## Logout local vs logout global

`POST /api/auth/logout` hace **logout local del cliente Gaceta**:

- limpia `gazette_access`
- limpia `gazette_refresh`
- limpia `gazette_oauth_state`

No cierra la sesión global del usuario en Identity Hub.

Diferencia importante:

- **Logout local de Gaceta**: termina la sesión del cliente actual.
- **Logout global de Identity Hub**: termina la sesión SSO central del usuario en el IdP.

Si el navegador sigue autenticado en Identity Hub, un nuevo `GET /auth/login` puede volver a entrar sin pedir credenciales. Eso es esperado en un escenario SSO.

## Errores y comportamiento HTTP

### Redirects a la vista de error del cliente

`GET /auth/callback` redirige a la vista de error del cliente cuando ocurre alguno de estos casos:

- `error` devuelto por Identity Hub
- `invalid_state`
- `missing_code`
- `token_exchange_failed`

La redirección va a:

- `${GAZETTE_UI_BASE_URL}/auth/error?error=...` si `GAZETTE_UI_BASE_URL` está configurado
- `/auth/error?error=...` si el frontend se sirve desde la misma app NestJS

### Errores JSON para APIs

Las rutas API protegidas no redirigen al frontend. Responden con errores HTTP:

- `401 Unauthorized`
  Cuando no hay sesión válida, el access token no es aceptable o el refresh falla.

- `403 Forbidden`
  Cuando la request está autenticada pero un guard de roles rechaza permisos.

## Variables de entorno necesarias

Variables mínimas relacionadas con SSO/Auth:

- `IDENTITY_HUB_URL`
  URL base del Identity Hub.

- `OAUTH_CLIENT_ID`
  Identificador del cliente Gaceta registrado en Identity Hub.

- `OAUTH_CLIENT_SECRET`
  Secreto del cliente confidential.

- `OAUTH_REDIRECT_URI`
  Callback registrado en Identity Hub. Debe apuntar al backend de Gaceta, por ejemplo `http://localhost:7000/auth/callback`.

- `OAUTH_ISSUER`
  Valor esperado del claim `iss` del access token.

- `AUTH_COOKIE_SECURE`
  Controla el flag `Secure` de las cookies auth.

- `GAZETTE_UI_BASE_URL`
  Opcional. Base pública del frontend cuando corre separado del backend.

- `CORS_ORIGIN`
  Opcional. Solo relevante en desarrollo cuando frontend y backend corren en orígenes distintos.

## Registro del cliente en Identity Hub

Para que Gaceta funcione como cliente SSO, en Identity Hub debe existir un cliente con al menos:

- `clientId`
- `clientSecret`
- `redirectUri`

Ese `redirectUri` debe coincidir exactamente con `OAUTH_REDIRECT_URI`.

## Consideraciones de routing en NestJS

La app usa `setGlobalPrefix('api')`, pero excluye:

- `/auth/login`
- `/auth/callback`

Por eso:

- las rutas OAuth de navegador viven fuera del prefijo `/api`
- las rutas API de sesión sí viven bajo `/api`, por ejemplo `/api/auth/me` y `/api/auth/logout`

Cuando Angular es servido por NestJS con `ServeStaticModule`, también se excluyen `/auth/login` y `/auth/callback` para que el fallback del SPA no intercepte el flujo OAuth.

## Pruebas manuales básicas

### Login exitoso

1. Abrir `GET /auth/login`.
2. Confirmar redirección a Identity Hub.
3. Autenticar usuario.
4. Confirmar callback a `GET /auth/callback`.
5. Verificar que se limpie `gazette_oauth_state`.
6. Verificar que se creen `gazette_access` y `gazette_refresh`.
7. Verificar redirección a `/admin` o a `${GAZETTE_UI_BASE_URL}/admin`.

### Estado inválido

1. Alterar o eliminar `gazette_oauth_state`.
2. Llamar a `GET /auth/callback` con `code/state`.
3. Confirmar redirección a la vista de error con `error=invalid_state`.

### Callback con error

1. Simular callback con `GET /auth/callback?error=access_denied`.
2. Confirmar limpieza de `gazette_oauth_state`.
3. Confirmar redirección a la vista de error del cliente.

### Sesión válida para APIs

1. Con cookies auth válidas, llamar `GET /api/auth/me`.
2. Confirmar respuesta `200` con el usuario local.

### Access expirado con refresh válido

1. Dejar expirar `gazette_access`.
2. Mantener `gazette_refresh` válido.
3. Llamar `GET /api/auth/me`.
4. Confirmar renovación silenciosa de cookies y respuesta `200`.

### Refresh inválido o expirado

1. Mantener `gazette_access` inválido o expirado.
2. Usar `gazette_refresh` inválido o expirado.
3. Llamar una API protegida.
4. Confirmar limpieza de cookies auth y respuesta `401`.

### Logout local

1. Llamar `POST /api/auth/logout`.
2. Confirmar limpieza de cookies locales.
3. Repetir `GET /api/auth/me`.
4. Confirmar `401`.
5. Ejecutar de nuevo `GET /auth/login` y verificar que el usuario puede reingresar si sigue autenticado en Identity Hub.
