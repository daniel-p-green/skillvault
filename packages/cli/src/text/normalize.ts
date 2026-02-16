export function normalizeTextForAnalysis(input: string): string {
  return input.normalize('NFC').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export function tokenCountNormalized(input: string): number {
  return normalizeTextForAnalysis(input).split(/\s+/g).filter(Boolean).length;
}
