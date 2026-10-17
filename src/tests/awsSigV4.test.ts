import { describe, it, expect } from 'vitest';
import { signAwsRequest } from '../lib/providers/awsSigV4';

describe('awsSigV4', () => {
  const credentials = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  };

  it('generates correct date stamps and headers for a POST request', async () => {
    const fixedDate = new Date('2026-10-17T12:00:00Z');
    const signed = await signAwsRequest(
      {
        method: 'POST',
        url: 'https://bedrock-runtime.ap-southeast-2.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2:0/converse',
        service: 'bedrock',
        region: 'ap-southeast-2',
        body: JSON.stringify({ messages: [{ role: 'user', content: [{ text: 'Hello' }] }] }),
        headers: {
          'content-type': 'application/json',
        },
        datetime: fixedDate,
      },
      credentials
    );

    expect(signed.headers['x-amz-date']).toBe('20261017T120000Z');
    expect(signed.headers['host']).toBe('bedrock-runtime.ap-southeast-2.amazonaws.com');
    expect(signed.headers['Authorization']).toContain('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261017/ap-southeast-2/bedrock/aws4_request');
    expect(signed.headers['Authorization']).toContain('SignedHeaders=content-type;host;x-amz-date');
    expect(signed.headers['Authorization']).toMatch(/Signature=[a-f0-9]{64}/);
  });

  it('includes session token if provided', async () => {
    const signed = await signAwsRequest(
      {
        method: 'POST',
        url: 'https://bedrock-runtime.us-east-1.amazonaws.com/model/amazon.nova-pro-v1:0/converse',
        service: 'bedrock',
        region: 'us-east-1',
        headers: { 'content-type': 'application/json' },
      },
      {
        ...credentials,
        sessionToken: 'AQoDYXdzEJr111111EXAMPLE',
      }
    );

    expect(signed.headers['x-amz-security-token']).toBe('AQoDYXdzEJr111111EXAMPLE');
    expect(signed.headers['Authorization']).toContain('x-amz-security-token');
  });

  it('throws an error if credentials are empty', async () => {
    await expect(
      signAwsRequest(
        {
          method: 'POST',
          url: 'https://bedrock-runtime.ap-southeast-2.amazonaws.com/model/test/converse',
          service: 'bedrock',
          region: 'ap-southeast-2',
        },
        { accessKeyId: '', secretAccessKey: '' }
      )
    ).rejects.toThrow('AWS credentials missing');
  });
});
