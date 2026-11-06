import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/index.js';

describe('healthResponseSchema', () => {
  it('accepts the API health response', () => {
    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        service: 'nuvio-api'
      }).success
    ).toBe(true);
  });
});
