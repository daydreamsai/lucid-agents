import { describe, expect, it } from 'bun:test';

import {
  assertAuthorized,
  assertPreviewIntegrity,
  previewCreateTask,
} from '../preview';
import { TaskmarketError } from '../errors';
import { BASE_CAIP2, BASE_NETWORK_NAME, BASE_USDC_ADDRESS } from '../constants';

const clock = {
  now: () => Date.parse('2026-08-25T12:00:00.000Z'),
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
};

describe('previewCreateTask', () => {
  it('shows description, reward, deadline, deliverables, Base, and max spend', () => {
    const preview = previewCreateTask(
      {
        description: 'Summarize the weekly onchain report',
        rewardUsdc: '1.5',
        durationHours: 24,
        tags: ['research'],
        deliverables: 'One markdown file, 400-800 words',
      },
      clock
    );

    expect(preview.operation).toBe('create');
    expect(preview.description).toBe('Summarize the weekly onchain report');
    expect(preview.rewardUsdc).toBe('1.5');
    expect(preview.rewardBaseUnits).toBe('1500000');
    expect(preview.deadlineIso).toBe('2026-08-26T12:00:00.000Z');
    expect(preview.deliverables).toBe('One markdown file, 400-800 words');
    expect(preview.network).toBe(BASE_NETWORK_NAME);
    expect(preview.networkCaip2).toBe(BASE_CAIP2);
    expect(preview.asset).toBe(BASE_USDC_ADDRESS);
    expect(preview.maxSpendUsdc).toBe('1.5');
    expect(preview.idempotencyKey).toBe(clock.randomUUID());
    expect(preview.previewId.startsWith('0x')).toBe(true);
  });

  it('rejects reward above max spend before any payment is considered', () => {
    expect(() =>
      previewCreateTask(
        {
          description: 'too expensive',
          rewardBaseUnits: '2000',
          durationHours: 1,
          tags: ['x'],
          deliverables: 'file',
          maxSpendBaseUnits: '1000',
        },
        clock
      )
    ).toThrow(TaskmarketError);
  });

  it('binds authorization to the issued previewId', () => {
    const preview = previewCreateTask(
      {
        description: 'ok',
        rewardUsdc: '0.1',
        durationHours: 2,
        tags: ['x'],
        deliverables: 'file',
      },
      clock
    );
    expect(() =>
      assertAuthorized(preview, {
        previewId: preview.previewId,
        confirmed: true,
      })
    ).not.toThrow();
    expect(() =>
      assertAuthorized(preview, {
        previewId: preview.previewId,
        confirmed: false as unknown as true,
      })
    ).toThrow('Fresh explicit user authorization');
    expect(() =>
      assertAuthorized(preview, { previewId: '0xabc', confirmed: true })
    ).toThrow('previewId');
  });

  it('detects tampered preview fields', () => {
    const preview = previewCreateTask(
      {
        description: 'ok',
        rewardUsdc: '0.1',
        durationHours: 2,
        tags: ['x'],
        deliverables: 'file',
      },
      clock
    );
    expect(() =>
      assertPreviewIntegrity({ ...preview, rewardBaseUnits: '999999' })
    ).toThrow('Preview fields do not match');
  });
});
