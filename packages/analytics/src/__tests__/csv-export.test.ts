import { describe, expect, it } from 'bun:test';
import { exportToCSV } from '../api';
import { createPaymentTracker } from '@lucid-agents/payments';
import { createInMemoryPaymentStorage } from '@lucid-agents/payments';

describe('CSV Export Escaping', () => {
  it('escapes commas in field values', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('group, with, commas', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    expect(csv).toContain('"group, with, commas"');

    const lines = csv.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('escapes quotes in field values', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('group "with" quotes', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toContain('"group ""with"" quotes"');
  });

  it('escapes newlines in field values', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('group\nwith\nnewlines', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    expect(csv).toContain('"group\nwith\nnewlines"');
  });

  it('prevents formula injection with = character', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('=SUM(A1:A10)', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toMatch(/^[^,]*,"'=SUM\(A1:A10\)"/);
  });

  it('prevents formula injection with + character', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('+CMD|"/c calc"!A0', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toMatch(/^[^,]*,"'\+CMD/);
  });

  it('prevents formula injection with - character', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('-2+5+cmd|"/c calc"!A0', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toMatch(/^[^,]*,"'\-2\+5/);
  });

  it('prevents formula injection with @ character', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('@SUM(1+1)*cmd|"/c calc"!A0', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toMatch(/^[^,]*,"'@SUM/);
  });

  it('handles normal values without escaping', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('normal-group-name', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    const lines = csv.split('\n');
    const dataLine = lines[1];

    expect(dataLine).toContain('normal-group-name');
    expect(dataLine).not.toContain('"normal-group-name"');
  });

  it('handles complex field with multiple special characters', async () => {
    const storage = createInMemoryPaymentStorage();
    const tracker = createPaymentTracker(storage);

    await tracker.recordOutgoing('group, with "quotes" and\nnewlines', 'global', 1000n);

    const csv = await exportToCSV(tracker);
    expect(csv).toContain('"group, with ""quotes"" and\nnewlines"');
  });
});

