import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../lib/webhook-signature';

describe('verifyWebhookSignature', () => {
  it('accepts a matching HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ lead_id: 'lead-1', status: 'Success' });
    const secret = 'test-secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('hex');

    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('rejects invalid, missing, and malformed signatures', () => {
    const body = JSON.stringify({ lead_id: 'lead-1', status: 'Success' });
    const secret = 'test-secret';

    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, 'bad-signature', secret)).toBe(false);
    expect(verifyWebhookSignature(body, '00', secret)).toBe(false);
  });
});
