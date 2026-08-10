import 'dotenv/config';

import dataSource from 'src/database/data-source';
import { generateSlug } from 'src/helpers/slug-generator';
import { DocumentRecord, DocumentRecordType } from 'src/modules/documents/entities';
import { generateDocumentIdentifiers } from 'src/modules/documents/helpers';

async function main(): Promise<void> {
  try {
    await dataSource.initialize();

    const types = await dataSource.manager.find(DocumentRecordType, { order: { id: 'ASC' } });
    const typeUpdates: Array<{ id: number; slug: string }> = [];
    const typeSlugsById = new Map<number, string>();
    const typeSlugOwners = new Map<string, number>();

    for (const type of types) {
      const slug = type.slug ?? generateSlug(type.name);
      if (!slug) throw new Error(`could not generate slug for document type ${type.id} (${type.name})`);

      const existingTypeId = typeSlugOwners.get(slug);
      if (existingTypeId !== undefined) {
        throw new Error(`duplicate document type slug "${slug}" for types ${existingTypeId} and ${type.id}`);
      }

      typeSlugOwners.set(slug, type.id);
      typeSlugsById.set(type.id, slug);
      if (type.slug === null) typeUpdates.push({ id: type.id, slug });
    }

    const documents = await dataSource.manager.find(DocumentRecord, {
      relations: { type: true },
      order: { id: 'ASC' },
    });
    const documentUpdates: Array<{ id: string; slug: string }> = [];
    const documentSlugOwners = new Map<string, string>();

    for (const document of documents) {
      let slug = document.slug;

      if (slug === null) {
        const typeSlug = typeSlugsById.get(document.typeId);
        if (!document.type || !typeSlug) {
          throw new Error(`document ${document.id} has no document type slug available`);
        }

        ({ slug } = generateDocumentIdentifiers(typeSlug, document.correlativeNumber, document.suffix, document.year));
        if (!slug) throw new Error(`could not generate slug for document ${document.id}`);

        documentUpdates.push({ id: document.id, slug });
      }

      if (!slug) throw new Error(`document ${document.id} has an empty slug`);

      const existingDocumentId = documentSlugOwners.get(slug);
      if (existingDocumentId) {
        throw new Error(`duplicate document slug "${slug}" for documents ${existingDocumentId} and ${document.id}`);
      }
      documentSlugOwners.set(slug, document.id);
    }

    await dataSource.transaction(async (manager) => {
      for (const update of typeUpdates) {
        await manager.query('UPDATE "document_types" SET "slug" = $1 WHERE "id" = $2 AND "slug" IS NULL', [
          update.slug,
          update.id,
        ]);
      }

      for (const update of documentUpdates) {
        await manager.query('UPDATE "documents" SET "slug" = $1 WHERE "id" = $2 AND "slug" IS NULL', [
          update.slug,
          update.id,
        ]);
      }
    });

    console.log('Backfill completed.');
    console.log(`Document types updated: ${typeUpdates.length}`);
    console.log(`Documents updated: ${documentUpdates.length}`);
  } catch (error: unknown) {
    process.exitCode = 1;
    console.error(`Backfill failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('No changes were written.');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void main();
