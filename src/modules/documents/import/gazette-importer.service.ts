import { Injectable, Logger } from '@nestjs/common';

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

import { FileImporterService } from 'src/modules/files/file-importer.service';
import { DocumentService } from '../services';
import { QueryFailedError } from 'typeorm';

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
  correlativeNumber: number | null;
  suffix: string | null;
  year: number | null;
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

  async run({ csvPath, typeId, filesFolder }: ImportParams) {
    const records = this.readCsv(csvPath);

    // let missingFile = 0;
    // let invalidCode = 0;

    for (const row of records) {
      // try {
      //   const parsed = this.parseRow(row);
      //   if (!parsed.fileName) {
      //     missingFile++;
      //     console.warn(`⚠ Sin fileName`);
      //     console.warn(`→ CSV: ${csvPath}`);
      //     console.warn(`→ Código: ${row['Nro']}`);
      //     console.warn(`→ HTML: ${row['Descargar']}`);
      //     console.log('');
      //     continue;
      //   }
      //   if (!parsed.correlativeNumber || !parsed.year) {
      //     invalidCode++;
      //     console.warn(`⚠ Código inválido`);
      //     console.warn(`→ CSV: ${csvPath}`);
      //     console.warn(`→ Valor: ${row['Nro']}`);
      //     console.log('');
      //     continue;
      //   }
      // } catch (error) {
      //   console.error('❌ Error inesperado:', error);
      // }
      const parsed = this.parseRow(row);
      await this.processRecord(parsed, typeId, filesFolder);
    }

    // console.log(`✅ Validación terminada: ${csvPath}`);
    // console.log(`→ Sin archivo: ${missingFile}`);
    // console.log(`→ Código inválido: ${invalidCode}`);
    // console.log('');
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
      suffix: code.suffix,
      year: code.year,
      publicationDate,
      fileName,
    };
  }

  // private parseCode(code: string) {
  //   const [num, year] = code.split('/');
  //   return {
  //     correlativeNumber: Number(num),
  //     year: Number(year),
  //   };
  // }

  private parseCode(code: string): {
    correlativeNumber: number | null;
    suffix: string | null;
    year: number | null;
  } {
    if (!code) {
      return { correlativeNumber: null, suffix: null, year: null };
    }

    const [left, yearStr] = code.split('/');

    if (!left || !yearStr) {
      return { correlativeNumber: null, suffix: null, year: null };
    }

    let correlativeNumber: number | null = null;
    let suffix: string | null = null;

    if (left.includes('-')) {
      const [num, suf] = left.split('-');

      correlativeNumber = Number(num);
      suffix = suf?.trim() || null;
    } else {
      correlativeNumber = Number(left);
    }

    return {
      correlativeNumber: isNaN(correlativeNumber) ? null : correlativeNumber,
      suffix,
      year: Number(yearStr),
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
    // 🔒 Seguridad (aunque ya validaste antes)
    if (!parsed.fileName || !parsed.correlativeNumber || !parsed.year) {
      return;
    }

    const filePath = path.join(process.cwd(), filesFolder, parsed.fileName);

    // 📂 Validar archivo físico
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠ Archivo no encontrado: ${parsed.fileName}`);
      return;
    }

    try {
      // 1️⃣ Crear archivo (PENDING)
      const storedFile = await this.filesService.createFromPath(filePath, parsed.year);

      // 2️⃣ Crear documento (transacción + activa archivo)
      await this.documentsService.create({
        typeId,
        fileId: storedFile.id,
        summary: parsed.summary,
        correlativeNumber: parsed.correlativeNumber,
        ...(parsed.suffix && {
          suffix: parsed.suffix,
        }),
        year: parsed.year,
        publicationDate: parsed.publicationDate,
      });
    } catch (error: unknown) {
      // ⚠ duplicado → ignorar silenciosamente
      if (error instanceof QueryFailedError && error['code'] === '23505') {
        return;
      }

      // ❌ error real
      console.error(`❌ Error procesando ${parsed.fileName}`);
      console.error(parsed);
    }
  }
}
