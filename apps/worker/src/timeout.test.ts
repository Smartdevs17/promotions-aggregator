import { describe, expect, it } from 'vitest';
import { JobTimeoutError, withJobTimeout } from './timeout.js';

describe('job timeout', () => {
  it('rejects when work exceeds the configured bound', async () => {
    await expect(withJobTimeout(new Promise<void>(() => undefined), 5)).rejects.toBeInstanceOf(JobTimeoutError);
  });
});
