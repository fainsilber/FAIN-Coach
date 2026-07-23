import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from './en';
import { he } from './he';
import { detectLanguage, translateFor } from './index';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('catalog completeness', () => {
  it('Hebrew covers exactly the English keys', () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  });

  it('no catalog entry is empty', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(he)]) {
      expect(value.trim(), `empty translation for ${key}`).not.toBe('');
    }
  });

  it('Hebrew preserves the placeholders of parameterized keys', () => {
    for (const [key, template] of Object.entries(en)) {
      const params = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (params.length === 0) continue;
      const heParams = [
        ...he[key as keyof typeof en].matchAll(/\{(\w+)\}/g),
      ]
        .map((m) => m[1])
        .sort();
      expect(heParams, `placeholder mismatch in ${key}`).toEqual(params);
    }
  });
});

describe('translateFor', () => {
  it('translates with interpolation', () => {
    expect(translateFor('en')('gate.hi', { name: 'Dana' })).toBe('Hi Dana');
    expect(translateFor('he')('gate.hi', { name: 'דנה' })).toBe('שלום דנה');
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

  it('falls back to English for unsupported languages', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'de-DE'] });
    expect(detectLanguage()).toBe('en');
  });
});
