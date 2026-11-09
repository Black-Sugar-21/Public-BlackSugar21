import { describe, expect, it } from 'vitest';
import { LANGUAGES, TranslationService } from './translation.service';

const EXPECTED = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr'];

describe('translation parity', () => {
  it('offers exactly the 13 languages, with Hindi and without Indonesian', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual([...EXPECTED].sort());
  });

  it('every key has the same languages as Spanish, none empty', () => {
    const table = (new TranslationService() as any).translations as Record<string, Record<string, string>>;
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(300);
    const problems: string[] = [];
    for (const key of keys) {
      const have = Object.keys(table[key]).sort();
      if (have.join() !== [...EXPECTED].sort().join()) problems.push(`${key}: ${have.join(',')}`);
      for (const lang of EXPECTED) if (!String(table[key][lang] ?? '').trim()) problems.push(`${key}.${lang} empty`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps the placeholders of the Spanish text in every language', () => {
    const table = (new TranslationService() as any).translations as Record<string, Record<string, string>>;
    const problems: string[] = [];
    for (const [key, row] of Object.entries(table)) {
      for (const ph of row['es'].match(/\{[a-zA-Z]+\}/g) ?? []) {
        for (const lang of EXPECTED) if (!row[lang].includes(ph)) problems.push(`${key}.${lang} lacks ${ph}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
