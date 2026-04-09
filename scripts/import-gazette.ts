import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { GazetteImporterService } from 'src/modules/documents/import/gazette-importer.service';

async function bootstrap() {
  console.log('🚀 Iniciando importación...\n');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const importer = app.get(GazetteImporterService);

    const imports = [
      // { name: 'ley-municipal', typeId: 1 },
      { name: 'resolucion-municipal', typeId: 2 },
      { name: 'ordenanza-municipal', typeId: 3 },
      { name: 'decreto-municipal', typeId: 4 },
      { name: 'decreto-edil', typeId: 5 },
      // { name: 'resolucion-ejecutiva', typeId: 6 },
      // { name: 'resolucion-administrativa', typeId: 7 },
    ];

    for (const item of imports) {
      await importer.run({
        csvPath: `import-data/csv/${item.name}.csv`,
        typeId: item.typeId,
        filesFolder: `import-data/files/${item.name}`,
      });
    }
    console.log('\n✅ Todas las importaciones finalizadas');
  } catch (error) {
    console.error('\n❌ Error general:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
