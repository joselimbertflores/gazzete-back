# Gaceta - Backend

Servicio backend del sistema de Gaceta, encargado de administrar publicaciones, almacenar documentos PDF y autenticar usuarios mediante Identity Hub.

## Descripcion

El backend gestiona la logica de negocio para registrar, administrar y publicar documentos oficiales en PDF. Tambien actua como cliente OAuth confidential de Identity Hub usando Authorization Code con PKCE S256, callback server-side y cookies HTTP-only locales.

## Funcionalidades principales

- Registro y consulta de publicaciones.
- Carga y almacenamiento de documentos PDF.
- Administracion de metadatos de documentos.
- APIs para integracion con el frontend.
- SSO server-side con Identity Hub.

## Documentacion

- Integracion SSO/Auth del cliente Gaceta: [docs/architecture/sso-client-integration.md](docs/architecture/sso-client-integration.md)
- Relaciones legales de documentos: [docs/architecture/document-legal-relations.md](docs/architecture/document-legal-relations.md)

## Requisitos previos

- Node.js
- npm
- PostgreSQL

## Instalacion

```bash
npm install
```

## Configuracion

Copia `.env.example` a `.env` y ajusta los valores del ambiente.

Variables clave:

- `HOST`: URL base publica del backend para construir links de archivos.
- `DB_SYNCHRONIZE`: `true` solo en desarrollo local; `false` en staging/produccion y usar migraciones cuando existan.
- `IDENTITY_HUB_URL`: URL publica/navegable de Identity Hub para redirigir el navegador a `/oauth/authorize` y consultar JWKS.
- `IDENTITY_HUB_INTERNAL_URL`: URL server-to-server para endpoints `/internal/*` del Hub. En local puede ser igual a `IDENTITY_HUB_URL`; en Docker/produccion puede diferir por red interna.
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `OAUTH_ISSUER`: credenciales y contrato OAuth registrados en Identity Hub.
- `AUTH_COOKIE_SECURE`: `true` cuando el backend corre detras de HTTPS.
- `CORS_ORIGIN`: unico origen permitido cuando el frontend corre separado. Si se omite, CORS no se habilita.
- `GAZETTE_UI_BASE_URL`: frontend separado opcional para redirects de exito/error.
- `BOOTSTRAP_ADMIN_EXTERNAL_KEY`: solo para `npm run bootstrap:admin`; debe ser un `externalKey` existente/asignable en Identity Hub.

## Scripts utiles

```bash
npm run start:dev
npm test
npm run build
BOOTSTRAP_ADMIN_EXTERNAL_KEY=IDH-U-... npm run bootstrap:admin
```
