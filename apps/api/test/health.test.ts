import { describe, expect, it } from 'vitest';
import { health } from '../src/functions/health.js';

describe('health', () => {
  it('returns the expected health payload', async () => {
    const response = await health({} as never, {} as never);

    expect(response).toEqual({
      status: 200,
      jsonBody: {
        status: 'ok',
        service: 'nuvio-api'
      }
    });
  });
});
