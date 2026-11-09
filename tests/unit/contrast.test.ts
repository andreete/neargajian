/**
 * WCAG 2.2 contrast checks for the design tokens in src/app/globals.css (kickoff §5:
 * check every text/background pair). AA: 4.5:1 normal text, 3:1 large text and UI parts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/app/globals.css', import.meta.url), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`token --${name} not found`);
  return m[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff';
const TEXT_PAIRS: [string, string, string][] = [
  ['ink on surface', token('ink'), WHITE],
  ['ink on canvas', token('ink'), token('canvas')],
  ['muted on surface', token('muted'), WHITE],
  ['muted on canvas', token('muted'), token('canvas')],
  ['subtle on surface', token('subtle'), WHITE],
  ['navy links on surface', token('navy'), WHITE],
  ['navy on sky-50 (chips, selected)', token('navy'), token('sky-50')],
  ['white on navy (primary button)', WHITE, token('navy')],
  ['white on navy-700 (hover)', WHITE, token('navy-700')],
  ['blue-600 eyebrow on surface', token('blue-600'), WHITE],
  ['warning text on warning-bg', token('warning'), token('warning-bg')],
  ['danger text on danger-bg', token('danger'), token('danger-bg')],
  ['success text on success-bg', token('success'), token('success-bg')],
  ['danger text on surface', token('danger'), WHITE],
];

describe('WCAG AA contrast of design tokens', () => {
  it.each(TEXT_PAIRS)('%s ≥ 4.5:1', (_name, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('focus ring and control borders reach 3:1 against white (non-text contrast)', () => {
    expect(contrast(token('blue'), WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(token('border-strong'), WHITE)).toBeGreaterThanOrEqual(3);
  });

  it('sky blue is never used as text on white (accent only)', () => {
    expect(contrast(token('sky'), WHITE)).toBeLessThan(4.5);
    expect(css).not.toMatch(/color:\s*var\(--sky\)/);
  });
});
