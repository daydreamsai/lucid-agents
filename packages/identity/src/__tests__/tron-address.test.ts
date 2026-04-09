import { describe, expect, it } from 'bun:test';

import {
  hexToTronBase58,
  isTronAddress,
  normalizeTronAddress,
  tronBase58ToHex,
} from '../tron/address';

describe('isTronAddress', () => {
  it('returns true for valid TRON base58 addresses', () => {
    expect(isTronAddress('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7')).toBe(true);
    expect(isTronAddress('THmfi8uJuUpTfUmYLDX7UD1KaE4P6HKgqA')).toBe(true);
    expect(isTronAddress('TV8KWmp8qcj55sjs1NSjVxmRmZP7CYzNxH')).toBe(true);
  });

  it('returns false for EVM hex addresses', () => {
    expect(isTronAddress('0x3aa92963de476e4c7f10e070d4cc99ed93602da2')).toBe(
      false
    );
  });

  it('returns false for empty strings', () => {
    expect(isTronAddress('')).toBe(false);
  });

  it('returns false for addresses not starting with T', () => {
    expect(isTronAddress('AFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7')).toBe(false);
  });

  it('returns false for wrong-length strings', () => {
    expect(isTronAddress('TFKNqk9bjwWp5u')).toBe(false);
    expect(isTronAddress('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7extra')).toBe(
      false
    );
  });
});

describe('tronBase58ToHex', () => {
  it('converts TRON Shasta IdentityRegistry address', async () => {
    const hex = await tronBase58ToHex('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7');
    expect(hex).toBe('0x3aa92963de476e4c7f10e070d4cc99ed93602da2');
  });

  it('converts TRON Mainnet IdentityRegistry address', async () => {
    const hex = await tronBase58ToHex('THmfi8uJuUpTfUmYLDX7UD1KaE4P6HKgqA');
    expect(hex).toBe('0x55924f4501997a8d9b6ddc4af351c4de957f8f29');
  });

  it('converts TRON Mainnet ReputationRegistry address', async () => {
    const hex = await tronBase58ToHex('TV8KWmp8qcj55sjs1NSjVxmRmZP7CYzNxH');
    expect(hex).toBe('0xd22391db9c9bd218a5eca5757259decc1d19f360');
  });

  it('converts TRON Mainnet ValidationRegistry address', async () => {
    const hex = await tronBase58ToHex('TCoJA4BYXWZhp5eanCchMw67VA83tQ83n1');
    expect(hex).toBe('0x1f088560b3d1fea32b1bbfd7ea4350f23f65e093');
  });

  it('converts TRON Shasta ReputationRegistry address', async () => {
    const hex = await tronBase58ToHex('TRaYogyr2qc7WgsmuVF5Js39aCmoG7vZrA');
    expect(hex).toBe('0xab38fa199ec496d2b5dd570a0bb81056ca99c189');
  });

  it('converts TRON Shasta ValidationRegistry address', async () => {
    const hex = await tronBase58ToHex('TPgGWWyUdxNryUCN49TdT4b3F4WB3Edr16');
    expect(hex).toBe('0x965d9e2d1b24d1d2746f1aaeee77de85c2b672d9');
  });

  it('throws for invalid TRON address', async () => {
    await expect(tronBase58ToHex('invalid')).rejects.toThrow(
      'Invalid TRON address'
    );
  });

  it('throws for hex address passed as base58', async () => {
    await expect(
      tronBase58ToHex('0x3aa92963de476e4c7f10e070d4cc99ed93602da2')
    ).rejects.toThrow('Invalid TRON address');
  });
});

describe('hexToTronBase58', () => {
  it('converts hex back to TRON Shasta IdentityRegistry address', async () => {
    const base58 = await hexToTronBase58(
      '0x3aa92963de476e4c7f10e070d4cc99ed93602da2'
    );
    expect(base58).toBe('TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7');
  });

  it('converts hex back to TRON Mainnet IdentityRegistry address', async () => {
    const base58 = await hexToTronBase58(
      '0x55924f4501997a8d9b6ddc4af351c4de957f8f29'
    );
    expect(base58).toBe('THmfi8uJuUpTfUmYLDX7UD1KaE4P6HKgqA');
  });

  it('roundtrips all known contract addresses', async () => {
    const addresses = [
      'THmfi8uJuUpTfUmYLDX7UD1KaE4P6HKgqA',
      'TV8KWmp8qcj55sjs1NSjVxmRmZP7CYzNxH',
      'TCoJA4BYXWZhp5eanCchMw67VA83tQ83n1',
      'TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7',
      'TRaYogyr2qc7WgsmuVF5Js39aCmoG7vZrA',
      'TPgGWWyUdxNryUCN49TdT4b3F4WB3Edr16',
    ];

    for (const original of addresses) {
      const hex = await tronBase58ToHex(original);
      const roundtripped = await hexToTronBase58(hex);
      expect(roundtripped).toBe(original);
    }
  });

  it('throws for invalid hex length', async () => {
    await expect(hexToTronBase58('0x1234' as `0x${string}`)).rejects.toThrow(
      'Invalid hex address: expected 40 hex characters'
    );
  });

  it('throws for non-hex characters', async () => {
    await expect(
      hexToTronBase58(
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG' as `0x${string}`
      )
    ).rejects.toThrow('Invalid hex address: contains non-hex characters');
  });
});

describe('normalizeTronAddress', () => {
  it('normalizes base58 to hex', async () => {
    const hex = await normalizeTronAddress(
      'TFKNqk9bjwWp5uRiiGimqfLhVQB8jSxYi7'
    );
    expect(hex).toBe('0x3aa92963de476e4c7f10e070d4cc99ed93602da2');
  });

  it('normalizes 0x hex to lowercase', async () => {
    const hex = await normalizeTronAddress(
      '0x3AA92963DE476E4C7F10E070D4CC99ED93602DA2'
    );
    expect(hex).toBe('0x3aa92963de476e4c7f10e070d4cc99ed93602da2');
  });

  it('normalizes 41-prefixed TRON hex', async () => {
    const hex = await normalizeTronAddress(
      '413aa92963de476e4c7f10e070d4cc99ed93602da2'
    );
    expect(hex).toBe('0x3aa92963de476e4c7f10e070d4cc99ed93602da2');
  });

  it('throws for completely invalid addresses', async () => {
    await expect(normalizeTronAddress('garbage')).rejects.toThrow(
      'Invalid TRON address'
    );
  });
});
