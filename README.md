# Gaceta - Backend

Servicio backend del sistema de Gaceta, encargado de administrar publicaciones, almacenar documentos PDF y autenticar usuarios mediante Identity Hub.

## Descripcion

El backend gestiona la logica de negocio para registrar, administrar y publicar documentos oficiales en PDF. Tambien actua como cliente OAuth confidential de Identity Hub usando Authorization Code con PKCE S256 y una sesion server-side identificada por una cookie opaca HTTP-only.

## Funcionalidades principales

- Registro y consulta de publicaciones.
- Carga y almacenamiento de documentos PDF.
- Administracion de metadatos de documentos.
- APIs para integracion con el frontend.
- SSO server-side con Identity Hub.

## Documentacion

- SSO con Identity Hub: [docs/architecture/authentication.md](docs/architecture/authentication.md)
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

Copia `.env.example` a `.env` y ajusta los valores del ambiente. `.env.example` es la referencia de variables, defaults y valores opcionales; la configuración específica del SSO se explica en [docs/architecture/authentication.md](docs/architecture/authentication.md).

## Scripts utiles

```bash
npm run start:dev
npm test
npm run build
BOOTSTRAP_ADMIN_EXTERNAL_KEY=IDH-U-... npm run bootstrap:admin
```
