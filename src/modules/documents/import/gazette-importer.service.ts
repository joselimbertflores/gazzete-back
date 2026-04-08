import { Injectable, Logger } from '@nestjs/common';

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

import { FileImporterService } from 'src/modules/files/file-importer.service';
import { DocumentService } from '../services';

export interface ImportParams {
  csvPath: string;
  typeId: number;
  filesFolder: string;
}

interface CsvData {
  Nombre: string;
  Resumen: string;
  Nro: string;
  Fecha: string;
  Descargar: string;
}

interface ParsedData {
  title: string;
  summary: string;
  correlativeNumber: number;
  year: number;
  publicationDate: Date;
  fileName: string | null;
}

@Injectable()
export class GazetteImporterService {
  private readonly logger = new Logger(GazetteImporterService.name);

  constructor(
    private filesService: FileImporterService,
    private documentsService: DocumentService,
  ) {}

  run({ csvPath }: ImportParams) {
    const records = this.readCsv(csvPath);

    let index = 0;

    for (const row of records) {
      index++;

      try {
        const parsed = this.parseRow(row);

        // 👉 SOLO mostrar problemas
        if (!parsed.fileName) {
          console.warn(`⚠ [${index}] Sin fileName - CSV PATH: ${csvPath}`);
          console.warn('Contenido =>', row['Descargar']);
          console.log('');
          continue;
        }

        if (!parsed.correlativeNumber || !parsed.year) {
          console.warn(`⚠ [${index}] Código inválido`);
          console.warn('Contenido =>', row['Nro']);
          console.log('');
          continue;
        }

        // 👉 opcional: ver algunos OK
        // if (index <= 5) console.log(parsed);
      } catch (error: unknown) {
        console.error(`❌ Error fila ${index}`);
        console.error(error);
      }
    }
    console.log(`✅ Validación terminada: ${csvPath}`);
    console.log(''); // Línea vacía
    console.log(''); // Línea vacía
  }

  private readCsv(csvPath: string): CsvData[] {
    const fullPath = path.join(process.cwd(), csvPath);

    if (!fs.existsSync(fullPath)) throw new Error(`CSV no encontrado: ${fullPath}`);

    const fileContent = fs.readFileSync(fullPath, 'utf-8');

    const records = parse<CsvData>(fileContent, {
      columns: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      delimiter: ';', // 👈 CLAVE
      relax_quotes: true, // 👈 por HTML
      relax_column_count: true, // 👈 por inconsistencias
      trim: true, // 👈 limpia espacios
      quote: false,
    });
    return records;
  }

  private parseRow(row: CsvData): ParsedData {
    const code = this.parseCode(row['Nro']);
    const publicationDate = this.parseDate(row['Fecha']);
    const fileName = this.extractFileName(row['Descargar']);
    return {
      title: row['Nombre'],
      summary: row['Resumen'],
      correlativeNumber: code.correlativeNumber,
      year: code.year,
      publicationDate,
      fileName,
    };
  }

  private parseCode(code: string) {
    const [num, year] = code.split('/');
    return {
      correlativeNumber: Number(num),
      year: Number(year),
    };
  }

  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/');
    return new Date(`${year}-${month}-${day}`);
  }

  private extractFileName(html: string | null | undefined): string | null {
    if (!html) return null;

    const cleaned = html.replace(/\s+/g, ' ').trim();

    const match = cleaned.match(/href\s*=\s*['"]([^'"]+)['"]/i);
    if (!match) return null;

    const url = match[1].trim();
    const fileName = url.split('/').pop()?.trim();

    return fileName || null;
  }

  private async processRecord(parsed: ParsedData, typeId: number, filesFolder: string) {
    if (!parsed.fileName) {
      this.logger.warn(`No se pudo extraer fileName para ${parsed.correlativeNumber}/${parsed.year}`);
      return;
    }

    const filePath = path.join(process.cwd(), filesFolder, parsed.fileName);

    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Archivo no encontrado: ${parsed.fileName}`);
      return;
    }

    try {
      // 2. Crear archivo (PENDING)
      const storedFile = await this.filesService.createFromPath(filePath, parsed.year);

      // 3. Crear documento (esto YA incluye markAsActive + transacción)
      await this.documentsService.create({
        typeId,
        fileId: storedFile.id,
        summary: parsed.summary,
        correlativeNumber: parsed.correlativeNumber,
        year: parsed.year,
        publicationDate: parsed.publicationDate,
      });

      this.logger.log(`✔ ${parsed.correlativeNumber}/${parsed.year}`);
    } catch (error: unknown) {
      this.logger.error(`Error procesando ${parsed.fileName}`, error);
    }
  }
}
