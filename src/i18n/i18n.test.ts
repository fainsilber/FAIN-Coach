import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from './en';
import { he } from './he';
import { esMX } from './es-MX';
import { detectLanguage, translateFor, type Language } from './index';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// Every non-English catalog gets the same completeness/placeholder checks
// below — adding a language means adding one entry here, nothing more.
const NON_ENGLISH_CATALOGS: Partial<Record<Language, Record<string, string>>> = {
  he,
  'es-MX': esMX,
};

describe('catalog completeness', () => {
  for (const [code, catalog] of Object.entries(NON_ENGLISH_CATALOGS)) {
    it(`${code} covers exactly the English keys`, () => {
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
    });

    it(`${code} preserves the placeholders of parameterized keys`, () => {
      for (const [key, template] of Object.entries(en)) {
        const params = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        if (params.length === 0) continue;
        const catalogParams = [...catalog[key].matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1])
          .sort();
        expect(catalogParams, `placeholder mismatch in ${key}`).toEqual(params);
      }
    });
  }

  it('no catalog entry is empty', () => {
    const allEntries = [
      ...Object.entries(en),
      ...Object.values(NON_ENGLISH_CATALOGS).flatMap((c) => Object.entries(c!)),
    ];
    for (const [key, value] of allEntries) {
      expect(value.trim(), `empty translation for ${key}`).not.toBe('');
    }
  });
});

describe('translateFor', () => {
  it('translates with interpolation', () => {
    expect(translateFor('en')('gate.hi', { name: 'Dana' })).toBe('Hi Dana');
    expect(translateFor('he')('gate.hi', { name: 'דנה' })).toBe('שלום דנה');
    expect(translateFor('es-MX')('gate.hi', { name: 'Dana' })).toBe('Hola Dana');
  });

  it('leaves unknown placeholders intact rather than erasing them', () => {
    expect(translateFor('en')('gate.hi', {})).toBe('Hi {name}');
  });
});

describe('detectLanguage', () => {
  it('prefers an explicit device choice over the browser', () => {
    localStorage.setItem('fain-coach.language', 'he');
    vi.stubGlobal('navigator', { languages: ['en-US'] });
    expect(detectLanguage()).toBe('he');
  });

  it('detects Hebrew from browser preferences, including the legacy iw tag', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'iw'] });
    expect(detectLanguage()).toBe('he');
  });

  it('detects Spanish from browser preferences regardless of region tag', () => {
    vi.stubGlobal('navigator', { languages: ['es-ES'] });
    expect(detectLanguage()).toBe('es-MX');
  });

  it('falls back to English for unsupported languages', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'de-DE'] });
    expect(detectLanguage()).toBe('en');
  });
});
