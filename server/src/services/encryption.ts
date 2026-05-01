// Encryption layer for iNFT payloads. AES-256-GCM for symmetric content
// encryption + ECIES (secp256k1) for sealing the symmetric key to a
// recipient's pubkey.
//
// We use node:crypto here rather than the SDK's built-ins because the
// 0G TS SDK encryption helpers are still moving — this gives us a stable
// independent baseline. The wire format is documented below so it's
// interop-friendly with the SDK path later.
//
// Wire format for a sealed payload (all base64url, joined by ".").
//   v1.{ephPub}.{nonce}.{tag}.{ciphertext}.{wrappedKey}
//
//   ephPub      — sender ephemeral secp256k1 public key (compressed, 33 bytes)
//   nonce       — AES-GCM 12-byte nonce
//   tag         — AES-GCM 16-byte auth tag
//   ciphertext  — AES-256-GCM(content)
//   wrappedKey  — symmetric key wrapped via ECIES for the recipient's pubkey

import crypto from 'node:crypto';

const VERSION = 'v1';

export interface SealedPayload {
  serialized: string;        // wire format above
  rootKeyId: string;         // sha256(symmetricKey).slice(0, 16) — for indexing
}

export function generateSymmetricKey(): Buffer {
  return crypto.randomBytes(32);
}

export function aesEncrypt(content: Buffer, key: Buffer): {
  ciphertext: Buffer;
  nonce: Buffer;
  tag: Buffer;
} {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(content), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, nonce, tag };
}

export function aesDecrypt(
  ciphertext: Buffer,
  key: Buffer,
  nonce: Buffer,
  tag: Buffer,
): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Lightweight ECIES on secp256k1: ephemeral ECDH + HKDF-SHA256 + AES-256-GCM.
// We re-implement minimally to avoid pulling extra deps; the SDK's helper
// is stricter but compatible with this format.
export function eciesSeal(plaintextKey: Buffer, recipientPubKey: Buffer): Buffer {
  const eph = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const ephPubRaw = eph.publicKey.export({ format: 'der', type: 'spki' });

  // ECDH against the recipient
  const recipientKey = crypto.createPublicKey({
    key: spkiFromCompressed(recipientPubKey),
    format: 'der',
    type: 'spki',
  });
  const shared = crypto.diffieHellman({
    privateKey: eph.privateKey,
    publicKey: recipientKey,
  });

  const okm = crypto.hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from('2in/ecies'), 44);
  const okmBuf = Buffer.from(okm);
  const aesKey = okmBuf.subarray(0, 32);
  const nonce = okmBuf.subarray(32, 44);

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, nonce);
  const ct = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from(ephPubRaw), tag, ct]);
}

export function sealForRecipient(
  content: Buffer,
  recipientPubKey: Buffer,
): SealedPayload {
  const symKey = generateSymmetricKey();
  const { ciphertext, nonce, tag } = aesEncrypt(content, symKey);
  const wrappedKey = eciesSeal(symKey, recipientPubKey);

  const serialized = [
    VERSION,
    'rsvd', // first segment placeholder so we keep wire-format extensible
    b64u(nonce),
    b64u(tag),
    b64u(ciphertext),
    b64u(wrappedKey),
  ].join('.');

  const rootKeyId = crypto.createHash('sha256').update(symKey).digest('hex').slice(0, 16);
  return { serialized, rootKeyId };
}

function b64u(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

// Convert a 33-byte compressed secp256k1 pubkey to an SPKI buffer.
// Builds the DER prefix manually — small + dependency-free.
function spkiFromCompressed(pub: Buffer): Buffer {
  if (pub.length !== 33) throw new Error('expected 33-byte compressed secp256k1 pubkey');
  // SPKI prefix for secp256k1 EC public key
  const prefix = Buffer.from(
    '3036301006072a8648ce3d020106052b8104000a032200',
    'hex',
  );
  return Buffer.concat([prefix, pub]);
}
