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
- alta automática JIT si el usuario no existe localmente
- sincronización básica del `fullName`
- roles locales propios de Gaceta

El shadow user local permite que Gaceta mantenga roles y decisiones propias del dominio sin depender de consultas remotas en cada request.
Identity Hub puede entregar `login` y `email` como datos disponibles en su catálogo interno, pero Gaceta no los persiste porque actualmente no los necesita. `externalKey` sigue siendo el vínculo real entre el usuario central y el shadow user local.

### Importación administrativa desde Identity Hub

Un admin local puede importar un shadow user antes de su primer login para asignarle roles de Gaceta:

1. El frontend consulta candidatos mediante el backend de Gaceta.
2. Gaceta llama a los endpoints internos de Identity Hub con HTTP Basic Authentication usando `OAUTH_CLIENT_ID` y `OAUTH_CLIENT_SECRET`.
3. Antes de crear el registro, Gaceta valida que el `externalKey` no exista localmente y vuelve a consultar el candidato exacto en Identity Hub.
4. Gaceta crea el shadow user con `externalKey`, `fullName` y los roles locales enviados por el admin.

Rutas locales protegidas por SSO y rol local `ADMIN`:

- `GET /api/users/identity-candidates?term=`
- `GET /api/users/identity-candidates/:externalKey`
- `POST /api/users/import-from-identity`

El navegador nunca llama directamente a Identity Hub para esta operación. Identity Hub mantiene al usuario central y no conoce roles de Gaceta.

Identity Hub expone `externalKey` como identificador estable de integración. Gaceta persiste ese valor en su shadow user local y no utiliza el `id` interno de base de datos de Identity Hub.

Flujo operativo recomendado:

1. Crear el usuario central en Identity Hub.
2. Asignarle acceso a la aplicación Gaceta desde Identity Hub.
3. Importarlo desde Gaceta cuando necesite roles locales específicos antes del primer login.
4. Permitir el login SSO posterior. La sincronización JIT solo actualiza datos descriptivos locales y conserva los roles definidos en Gaceta.

En producción, TypeORM tiene `synchronize` desactivado. Si se aplicó una versión intermedia de esta implementación, deben eliminarse las columnas locales innecesarias:

```sql
ALTER TABLE users DROP COLUMN IF EXISTS login;
ALTER TABLE users DROP COLUMN IF EXISTS email;
```

El esquema local vigente debe conservar `users.externalKey` como columna única y `users.fullName` como columna requerida.

### Roles locales y alta JIT

`syncUserFromIdentity` consulta el catálogo interno para actualizar `fullName`, pero no sobrescribe roles de un shadow user existente. Si crea un shadow user por JIT durante el primer login, asigna únicamente el rol local por defecto `USER`.

El primer `ADMIN` no puede depender de la importación administrativa porque todavía no existe un admin autorizado para ejecutarla. Debe crearse mediante el comando de bootstrap local:

```bash
BOOTSTRAP_ADMIN_EXTERNAL_KEY=IDH-U-... npm run bootstrap:admin
```

Este comando se ejecuta una sola vez durante la inicialización operativa de Gaceta, después de crear el usuario central y asignarle acceso a Gaceta en Identity Hub. Requiere:

- `BOOTSTRAP_ADMIN_EXTERNAL_KEY`
  `externalKey` exacto del usuario central que será el primer admin local.
- `IDENTITY_HUB_INTERNAL_URL`
  URL interna usada para consultar al usuario asignable en Identity Hub.
- `OAUTH_CLIENT_ID`
  Identificador del cliente Gaceta usado por HTTP Basic Authentication.
- `OAUTH_CLIENT_SECRET`
  Secreto del cliente Gaceta usado por HTTP Basic Authentication.

El comando no crea nada si ya existe algún `ADMIN` local. Tampoco promueve usuarios shadow existentes: si el `externalKey` ya está registrado sin rol `ADMIN`, termina con error para evitar cambios inesperados. Si Identity Hub no encuentra el usuario asignable, debe verificarse que exista, esté activo y tenga acceso a Gaceta.

El bootstrap sirve exclusivamente para crear el primer admin local. Los admins posteriores se gestionan desde la UI administrativa de Gaceta.

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

Para importación de usuarios también se usan:

- `400 Bad Request`
  Cuando el payload o los roles locales no son válidos.

- `404 Not Found`
  Cuando el usuario ya no está disponible en el catálogo interno de Identity Hub.

- `409 Conflict`
  Cuando el shadow user ya existe en Gaceta.

## Variables de entorno necesarias

Variables mínimas relacionadas con SSO/Auth:

- `IDENTITY_HUB_URL`
  URL base pública del Identity Hub usada para OAuth, JWKS y SSO.

- `IDENTITY_HUB_INTERNAL_URL`
  URL base interna usada por el backend de Gaceta para consumir endpoints service-to-service de Identity Hub.
  En desarrollo puede coincidir con `IDENTITY_HUB_URL`. Las llamadas internas usan `/internal/*` sin prefijo `/api`.

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
