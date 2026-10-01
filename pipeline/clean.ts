import iconv from 'iconv-lite';

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Reverses UTF-8 that was misread as cp1252, e.g. "CaffÃ¨" → "Caffè".
export function fixMojibake(s: string): string {
  const restored = s.replaceAll('Ã ', 'Ã\u00a0').replace(/Ã$/, 'Ã\u00a0');

  const bytes = iconv.encode(restored, 'win1252');
  if (iconv.decode(bytes, 'win1252') !== restored) {
    return s;
  }

  try {
    return utf8.decode(bytes);
  } catch {
    return s;
  }
}
