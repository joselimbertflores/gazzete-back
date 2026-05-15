# Document Legal Relations

Este documento define la decisión arquitectónica para modelar relaciones legales entre documentos normativos en el backend de **Gaceta**.

## Scope

- Aplica al módulo de documentos en NestJS, TypeORM y PostgreSQL.
- Define el modelo de dominio, invariantes, restricciones de base de datos y flujo transaccional.
- No implementa entidades, servicios, controladores ni migraciones.

## Current Domain Context

La base actual del dominio ya contiene estos elementos:

- [`DocumentRecord`](../../src/modules/documents/entities/document.entity.ts) mantiene `legalStatus`.
- [`DocumentService`](../../src/modules/documents/services/document.service.ts) y [`DocumentPublicService`](../../src/modules/documents/services/document-public.service.ts) ya filtran por `legalStatus`.
- [`DocumentRecordType`](../../src/modules/documents/entities/document-type.entity.ts) define el tipo documental, pero no altera la semántica de la relación legal.

## Current Legal Statuses

La implementación actual solo considera estos estados legales:

```ts
export enum DocumentLegalStatus {
  VALID = 'VALID',
  MODIFIED = 'MODIFIED',
  ABROGATED = 'ABROGATED',
  DEROGATED = 'DEROGATED',
}
```

Como posible extensión futura podrían evaluarse otros estados, pero no forman parte de la decisión actual.

## Current Relation Types

La implementación actual solo considera estos tipos de relación:

```ts
export enum DocumentRelationType {
  MODIFIES = 'MODIFIES',
  ABROGATES = 'ABROGATES',
  DEROGATES = 'DEROGATES',
}
```

Mapeo entre tipo de relación y `legalStatus` del documento afectado:

| `DocumentRelation.type` | `targetDocument.legalStatus` |
| --- | --- |
| `MODIFIES` | `MODIFIED` |
| `ABROGATES` | `ABROGATED` |
| `DEROGATES` | `DEROGATED` |

## Architectural Decision

La decisión adoptada es:

- `DocumentRecord` mantiene `legalStatus` como campo denormalizado para filtros y consultas rápidas.
- `DocumentRelation` representa la relación legal entre documentos.
- `sourceDocument` es el documento que produce el cambio jurídico.
- `targetDocument` es el documento afectado.
- Un documento puede tener muchas relaciones salientes.
- Un documento solo puede tener una relación entrante.
- No se usa `isActive`.
- Si una relación deja de corresponder, se elimina físicamente.
- Al crear o actualizar una relación, se sincroniza el `legalStatus` del `targetDocument`.
- Al eliminar una relación, el `targetDocument` vuelve a `VALID`.

Interpretación:

```text
A MODIFIES B
```

Significa:

- A modifica a B.
- B fue modificado por A.
- `B.legalStatus = MODIFIED`

## Conceptual Model

`DocumentRelation` debe contemplar conceptualmente:

- `id`
- `sourceDocumentId`
- `targetDocumentId`
- `type`
- `note`
- `createdAt`
- `updatedAt`

## Business Rules

- Un documento puede tener muchas relaciones salientes.
- Un documento puede tener como máximo una relación entrante.
- Un documento no puede relacionarse consigo mismo.
- El estado legal de un documento depende de su relación entrante vigente.
- Si un documento no tiene relación entrante, su `legalStatus` debe ser `VALID`.

Ejemplos:

```text
A MODIFIES B
A DEROGATES C
```

Resultado:

- A tiene múltiples relaciones salientes.
- B queda `MODIFIED`.
- C queda `DEROGATED`.

No debe permitirse:

```text
A MODIFIES B
C ABROGATES B
```

porque B tendría dos relaciones entrantes y su estado legal sería ambiguo.

## Why `targetDocumentId` Must Be UNIQUE

`targetDocumentId` debe ser `UNIQUE` para impedir que un mismo documento tenga más de una relación entrante activa.

Sin esa restricción, un documento podría quedar simultáneamente con estados incompatibles, por ejemplo `MODIFIED` y `ABROGATED`, lo que rompe la regla de que `legalStatus` debe ser determinista y sincronizable.

## Why `sourceDocument` and `targetDocument` Are `ManyToOne`

Ambas referencias deben modelarse como `ManyToOne` desde `DocumentRelation` hacia `DocumentRecord`:

- `sourceDocument` no puede ser `OneToOne` porque un mismo documento puede afectar a varios documentos.
- `DocumentRelation` es una entidad de relación y cada fila apunta a un `sourceDocument` y a un `targetDocument`.
- La unicidad del `targetDocument` es una regla de negocio implementada con `UNIQUE`, no una razón para modelar la asociación como `OneToOne`.

## Database Constraints

La tabla `document_relations` debe incluir al menos:

- `CHECK (source_document_id <> target_document_id)`
- `UNIQUE (target_document_id)`
- índice sobre `source_document_id`
- `ON DELETE RESTRICT` en `source_document_id`
- `ON DELETE RESTRICT` en `target_document_id`

Estas restricciones protegen la integridad referencial y evitan eliminar documentos que todavía participan en relaciones legales.

## Suggested Administrative Endpoints

- `PUT /admin/documents/:targetDocumentId/legal-relation`
- `DELETE /admin/documents/:targetDocumentId/legal-relation`

El `PUT` funciona como `upsert`:

- crea la relación si no existe;
- actualiza la relación si ya existe.

El `DELETE` elimina la relación y devuelve el `targetDocument` a `VALID`.

## Transactional Flow

La sincronización entre `DocumentRelation` y `DocumentRecord.legalStatus` debe ocurrir dentro de una misma transacción.

### Create or Update

Secuencia esperada:

1. Validar existencia de `sourceDocumentId`.
2. Validar existencia de `targetDocumentId`.
3. Validar que `sourceDocumentId != targetDocumentId`.
4. Buscar la relación entrante actual del target.
5. Crear la relación si no existe, o actualizarla si ya existe.
6. Sincronizar `targetDocument.legalStatus` según el `type`.
7. Confirmar la transacción.

### Delete

Secuencia esperada:

1. Buscar la relación entrante del target.
2. Eliminar físicamente la fila de `DocumentRelation`.
3. Actualizar `targetDocument.legalStatus = VALID`.
4. Confirmar la transacción.

Si cualquier paso falla, no debe persistirse un estado parcial.

## Read Model

El backend debe poder exponer:

- la relación entrante de un documento;
- las relaciones salientes de un documento.

Eso permite que otras capas, incluido frontend, muestren luego el contexto jurídico completo sin recalcularlo desde texto libre.

## Rejected Alternatives

- Solo `legalStatus`: simple, pero sin trazabilidad.
- `legalStatus` + texto libre: sin integridad referencial.
- `legalStatusChangedByDocumentId` en `DocumentRecord`: insuficiente para modelar el doble sentido entre documento origen y documento afectado.
- `DocumentRelation` con múltiples entrantes por target: más flexible, pero introduce ambigüedad y obliga a definir prioridades o recálculo de estados.

## Final Decision

La referencia de implementación debe ser:

- `DocumentRelation` como entidad explícita de relación legal;
- `legalStatus` en `DocumentRecord` como campo denormalizado;
- múltiples relaciones salientes por documento;
- máximo una relación entrante por documento;
- sincronización transaccional entre relación legal y estado legal del documento afectado.
