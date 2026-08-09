# SSO de Gaceta

Gaceta Backend es un cliente OAuth 2.0 confidential de Identity Hub. El navegador nunca recibe los tokens de Identity Hub: el backend completa Authorization Code con PKCE, guarda los tokens en PostgreSQL y entrega al navegador únicamente una cookie de sesión opaca.

## Arquitectura

- **Identity Hub** autentica al usuario, controla su acceso global a Gaceta y emite los tokens OAuth.
- **Gaceta Backend** inicia el login, recibe el callback, valida los tokens y mantiene la sesión local.
- **Gaceta Frontend** navega a las rutas de Auth del backend y consume la API con la cookie local.
- **PostgreSQL** guarda las transacciones OAuth temporales, las sesiones y los usuarios locales.

Identity Hub es la fuente de verdad para identidad y acceso a la aplicación. Gaceta conserva solamente la proyección local del usuario y sus roles propios.

## Login y callback

1. El navegador abre `GET /auth/login`.
2. Gaceta genera `state`, `code_verifier` y el `code_challenge` S256.
3. Guarda una transacción de cinco minutos en `oauth_transactions`. La tabla contiene el hash de `state` y el `code_verifier`; la cookie HTTP-only `gazette_oauth_transaction` contiene únicamente el identificador aleatorio de esa transacción.
4. Redirige a Identity Hub `/oauth/authorize` con `response_type=code`, PKCE, el client ID y el callback derivado de `GAZETTE_PUBLIC_URL`.
5. Identity Hub autentica al usuario y vuelve a `GET /auth/callback` con `code` y `state`.
6. Gaceta consume la transacción de forma atómica, valida `state` y la elimina aunque el intento sea inválido. Una transacción no se puede reutilizar.
7. Canjea el code en Identity Hub `/oauth/token`, autenticándose con `OAUTH_CLIENT_ID` y `OAUTH_CLIENT_SECRET` mediante HTTP Basic y enviando el `code_verifier`.
8. Valida el access token, sincroniza el usuario local y crea la sesión.
9. Redirige a `GAZETTE_UI_URL/admin`, o a `/admin` cuando frontend y backend comparten origen. Los errores vuelven a `/auth/error`.

## Sesión, refresh y logout

La sesión se persiste en `auth_sessions` con un ID aleatorio, el usuario local, los tokens de Identity Hub y la expiración del refresh token. La cookie HTTP-only `gazette_session` contiene solo el ID de la sesión; usa `SameSite=lax` y marca `Secure` cuando `GAZETTE_PUBLIC_URL` usa HTTPS.

El guard global resuelve esa sesión y valida el access token en cada ruta protegida. Si el access token expiró, Gaceta usa el refresh token server-side y persiste los tokens rotados. El refresh se serializa por sesión para evitar que dos requests consuman simultáneamente el mismo token.

Una sesión se elimina cuando expira el refresh token, Identity Hub rechaza el refresh como `invalid_grant` o la identidad del token ya no coincide con el usuario local. `POST /api/auth/logout` elimina la fila y limpia las cookies locales. Es un logout de Gaceta: no cierra la sesión global que el navegador pueda mantener en Identity Hub.

`GET /api/auth/me` devuelve el shadow user asociado a la sesión vigente.

## Validación JWT y JWKS

Antes de aceptar un access token, Gaceta valida:

- firma `RS256` y `kid` mediante el JWKS publicado por Identity Hub;
- issuer igual a `IDENTITY_HUB_PUBLIC_URL`;
- audience igual a `OAUTH_CLIENT_ID`;
- expiración y vigencia temporal;
- claims de identidad `sub`, `externalKey` y `name`.

El `externalKey` del token también debe coincidir con el usuario asociado a `auth_sessions`.

## Shadow users y roles locales

Los usuarios de Gaceta son shadow users identificados de forma única por `externalKey`:

- **JIT:** después de un login exitoso, si el usuario no existe se crea con rol `USER`; si existe, se actualiza su nombre sin reemplazar sus roles.
- **Importación administrativa:** un `ADMIN` puede buscar usuarios asignables en Identity Hub e importarlos mediante `/api/users/identity-candidates` y `POST /api/users/import-from-identity`.
- **Primer administrador:** `npm run bootstrap:admin` crea el primer `ADMIN` usando `BOOTSTRAP_ADMIN_EXTERNAL_KEY`. No promueve automáticamente un usuario local existente.

Los únicos roles locales son `ADMIN` y `USER`. Identity Hub decide quién puede acceder a Gaceta; los roles locales deciden qué puede hacer dentro de Gaceta.

## Configuración SSO

- `GAZETTE_PUBLIC_URL`: URL pública del backend. De ella se derivan `/auth/callback` y la seguridad de las cookies.
- `GAZETTE_UI_URL`: URL opcional del frontend cuando usa otro origen. Define los redirects y habilita CORS únicamente para ese origen.
- `IDENTITY_HUB_PUBLIC_URL`: URL pública de Identity Hub usada para authorize, token, JWKS e issuer.
- `IDENTITY_HUB_INTERNAL_URL`: override opcional para consultar el directorio de usuarios por la red interna; si se omite se usa la URL pública.
- `OAUTH_CLIENT_ID` y `OAUTH_CLIENT_SECRET`: credenciales confidential registradas en Identity Hub.
- `BOOTSTRAP_ADMIN_EXTERNAL_KEY`: identificador temporal usado solo para crear el primer administrador.

Identity Hub debe registrar el callback `/auth/callback` resuelto sobre `GAZETTE_PUBLIC_URL`, por ejemplo `http://localhost:7000/auth/callback`.
