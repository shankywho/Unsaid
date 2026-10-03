import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runEval } from '../scripts/eval';

describe('Phase 8 — Fixtures, Eval Suite, and Replay', () => {
  it('validates persona fixture', () => {
    const p = path.resolve(__dirname, '../fixtures/persona-ramesh-family.json');
    expect(fs.existsSync(p)).toBe(true);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(data.patient.name).toBe('Mohan Lal Sharma');
    expect(data.family.length).toBeGreaterThanOrEqual(3);
    expect(data.doctor.name).toBe('Dr. Mehta');
  });

  it('validates ambient week fixture', () => {
    const p = path.resolve(__dirname, '../fixtures/ambient-week.json');
    expect(fs.existsSync(p)).toBe(true);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(data.length).toBeGreaterThanOrEqual(40);
    expect(data.some((s: any) => s.text.toLowerCase().includes('priya'))).toBe(true);
    expect(data.some((s: any) => s.text.toLowerCase().includes('sugar'))).toBe(true);
  });

  it('validates eval fragments fixture', () => {
    const p = path.resolve(__dirname, '../fixtures/fragments-eval.json');
    expect(fs.existsSync(p)).toBe(true);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(data.length).toBeGreaterThanOrEqual(30);

    const requiresContextCount = data.filter((d: any) => d.requiresContext).length;
    const ratio = requiresContextCount / data.length;
    expect(ratio).toBeGreaterThanOrEqual(0.6); // ~70% require context

    for (const item of data) {
      expect(item.fragment).toBeDefined();
      expect(item.goldIntent).toBeDefined();
      expect(Array.isArray(item.goldKeywords)).toBe(true);
    }
  });

  it('runs ablation evaluation and confirms context ON outperforms context OFF', async () => {
    const { on, off } = await runEval();
    expect(on.top1).toBeGreaterThan(off.top1);
    expect(on.top3).toBeGreaterThan(off.top3);
    expect(on.top1).toBeGreaterThanOrEqual(0.7);
  }, 40000);
});
