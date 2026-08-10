import { DocumentNumberingMode } from '../entities/document-type.entity';

export const DOCUMENT_SUFFIX_MAX_LENGTH = 5;
export const DOCUMENT_SUFFIX_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export function normalizeDocumentSuffix(suffix: string | null | undefined): string | null {
  const normalizedSuffix = suffix?.trim().toUpperCase();
  return normalizedSuffix || null;
}

export function isValidDocumentSuffix(suffix: string | null): boolean {
  return suffix === null || (suffix.length <= DOCUMENT_SUFFIX_MAX_LENGTH && DOCUMENT_SUFFIX_PATTERN.test(suffix));
}

export function generateDocumentNumberingScope(numberingMode: DocumentNumberingMode, year: number): string {
  return numberingMode === DocumentNumberingMode.GLOBAL ? 'GLOBAL' : String(year);
}

export function generateDocumentCode(correlativeNumber: number, normalizedSuffix: string | null, year: number): string {
  const formattedNumber = correlativeNumber.toString().padStart(3, '0');

  return normalizedSuffix ? `${formattedNumber}-${normalizedSuffix}/${year}` : `${formattedNumber}/${year}`;
}

export function generateDocumentSlug(
  typeSlug: string,
  correlativeNumber: number,
  normalizedSuffix: string | null,
  year: number,
): string {
  const numberSegment = normalizedSuffix
    ? `${correlativeNumber}-${normalizedSuffix.toLowerCase()}`
    : correlativeNumber.toString();

  return `${typeSlug}-${numberSegment}-${year}`;
}

export function generateDocumentIdentifiers(
  typeSlug: string,
  correlativeNumber: number,
  suffix: string | null | undefined,
  year: number,
) {
  const normalizedSuffix = normalizeDocumentSuffix(suffix);

  return {
    suffix: normalizedSuffix,
    code: generateDocumentCode(correlativeNumber, normalizedSuffix, year),
    slug: generateDocumentSlug(typeSlug, correlativeNumber, normalizedSuffix, year),
  };
}
