/**
 * AWS Signature Version 4 (SigV4) Signer.
 * 
 * Implements canonical request creation, HMAC-SHA256 signature derivation,
 * and header authorization using the standard Web Crypto API (crypto.subtle).
 * Zero external dependencies.
 */

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SigV4SignRequestOptions {
  method: string;
  url: string;
  service: string;
  region: string;
  headers?: Record<string, string>;
  body?: string;
  datetime?: Date;
}

export interface SignedRequest {
  headers: Record<string, string>;
  url: string;
  method: string;
  body?: string;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function toArrayBuffer(data: string | Uint8Array | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (typeof data === 'string') {
    const enc = new TextEncoder().encode(data);
    return enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer;
  }
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function sha256(data: string | Uint8Array): Promise<ArrayBuffer> {
  const buffer = toArrayBuffer(data);
  return crypto.subtle.digest('SHA-256', buffer);
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuf = toArrayBuffer(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataBuf = toArrayBuffer(data);
  return crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
}

function formatDate(date: Date): { amzDate: string; dateStamp: string } {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  const dateStamp = `${year}${month}${day}`;
  const amzDate = `${dateStamp}T${hours}${minutes}${seconds}Z`;
  return { amzDate, dateStamp };
}

export async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key), dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

export async function signAwsRequest(
  options: SigV4SignRequestOptions,
  credentials: SigV4Credentials
): Promise<SignedRequest> {
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('AWS credentials missing: accessKeyId and secretAccessKey are required.');
  }

  const date = options.datetime || new Date();
  const { amzDate, dateStamp } = formatDate(date);

  const parsedUrl = new URL(options.url);
  const host = parsedUrl.host;
  const canonicalUri = parsedUrl.pathname || '/';

  // Sort and encode query parameters
  const queryParams: [string, string][] = [];
  parsedUrl.searchParams.forEach((val, key) => {
    queryParams.push([encodeURIComponent(key), encodeURIComponent(val)]);
  });
  queryParams.sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = queryParams.map(([k, v]) => `${k}=${v}`).join('&');

  const headers: Record<string, string> = {
    ...(options.headers || {}),
    host,
    'x-amz-date': amzDate,
  };

  if (credentials.sessionToken) {
    headers['x-amz-security-token'] = credentials.sessionToken;
  }

  // Canonicalize headers
  const sortedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeaders = sortedHeaderKeys
    .map((k) => {
      // Find original header key
      const origKey = Object.keys(headers).find((h) => h.toLowerCase() === k) || k;
      const val = headers[origKey].trim().replace(/\s+/g, ' ');
      return `${k}:${val}\n`;
    })
    .join('');

  const signedHeaders = sortedHeaderKeys.join(';');

  // Payload hash
  const payload = options.body || '';
  const payloadHash = toHex(await sha256(payload));

  // Canonical Request
  const canonicalRequest = [
    options.method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = toHex(await sha256(canonicalRequest));

  // Credential Scope
  const credentialScope = `${dateStamp}/${options.region}/${options.service}/aws4_request`;

  // String to Sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  // Compute Signature
  const signingKey = await getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    options.region,
    options.service
  );

  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  // Build Authorization Header
  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  headers['Authorization'] = authorizationHeader;

  return {
    headers,
    url: options.url,
    method: options.method.toUpperCase(),
    body: options.body,
  };
}
