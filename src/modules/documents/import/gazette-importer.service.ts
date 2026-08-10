import { Injectable } from '@nestjs/common';

import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';

import { FileImporterService } from 'src/modules/files/file-importer.service';
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
  constructor(private filesService: FileImporterService) {}

  async run({ csvPath, filesFolder }: ImportParams) {
    const records = this.readCsv(csvPath);

    for (const row of records) {
      const parsed = this.parseRow(row);
      await this.processRecord(parsed, filesFolder);
    }
  }

  private readCsv(csvPath: string): CsvData[] {
    const fullPath = path.join(process.cwd(), csvPath);

    if (!fs.existsSync(fullPath)) throw new Error(`CSV no encontrado: ${fullPath}`);

    const fileContent = fs.readFileSync(fullPath, 'utf-8');

    const records = parse<CsvData>(fileContent, {
      columns: true,
      skip_empty_lines: true,
      skip_records_with_empty_values: true,
      delimiter: ';',
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
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

  private async processRecord(parsed: ParsedData, filesFolder: string) {
    if (!parsed.fileName || !parsed.correlativeNumber || !parsed.year) {
      return;
    }

    const filePath = path.join(process.cwd(), filesFolder, parsed.fileName.trim());

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠ Archivo no encontrado: ${parsed.fileName} - path: ${filePath}`);
      return;
    }

    try {
      await this.filesService.createFromPath(filePath, parsed.year);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError && error['code'] === '23505') {
        return;
      }

      console.error(`❌ Error procesando ${parsed.fileName}`);
      console.error(parsed);
      console.log(error);
    }
  }
}
