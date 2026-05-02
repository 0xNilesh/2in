// File upload + serving for the Tools page (and any tool that needs a
// fileUrl input). Uploads land in /tmp/2in-uploads/{hash}.{ext}; we
// expose them via GET /api/upload/file/:filename so other tools can fetch
// by URL. Cap at 200MB per request, simple LRU eviction at ~2GB total.
//
//   POST /api/upload  multipart  → { url, mimeType, sizeBytes, filename }
//   GET  /api/upload/file/:name  → raw bytes
//   GET  /api/upload/list        → { files: [...] } debug helper

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createWriteStream, createReadStream, existsSync, statSync } from 'node:fs';
import { writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const UPLOAD_DIR = join(tmpdir(), '2in-uploads');
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB cap before LRU eviction

async function ensureDir(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });
}

function publicUrl(req: FastifyRequest, filename: string): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}/api/upload/file/${encodeURIComponent(filename)}`;
}

function safeExt(filename: string, mimeType: string | undefined): string {
  const fromName = extname(filename).toLowerCase();
  if (fromName) return fromName;
  // Crude fallback for common types when the upload doesn't include an extension.
  const map: Record<string, string> = {
    'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm',
    'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
    'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.webm',
  };
  return map[mimeType ?? ''] ?? '.bin';
}

async function lruEvict(): Promise<void> {
  await ensureDir();
  const entries = await readdir(UPLOAD_DIR);
  const stats = entries
    .map((name) => {
      try {
        const s = statSync(join(UPLOAD_DIR, name));
        return { name, size: s.size, mtime: s.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((e): e is { name: string; size: number; mtime: number } => e !== null);
  const total = stats.reduce((a, b) => a + b.size, 0);
  if (total <= MAX_TOTAL_BYTES) return;
  // Oldest first; evict until we're below the cap.
  stats.sort((a, b) => a.mtime - b.mtime);
  let running = total;
  for (const e of stats) {
    if (running <= MAX_TOTAL_BYTES) break;
    await rm(join(UPLOAD_DIR, e.name), { force: true }).catch(() => {});
    running -= e.size;
  }
}

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  await ensureDir();

  // Multipart upload — assumes @fastify/multipart is registered globally.
  // Single file per request; field name must be "file".
  app.post('/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const part = await (req as any).file();
    if (!part) throw app.httpErrors.badRequest('multipart "file" field required');
    const original = part.filename ?? 'upload';
    const mime = part.mimetype ?? 'application/octet-stream';
    const ext = safeExt(original, mime);
    const hash = createHash('sha1').update(`${original}:${Date.now()}:${randomBytes(4).toString('hex')}`).digest('hex').slice(0, 12);
    const filename = `${hash}${ext}`;
    const dest = join(UPLOAD_DIR, filename);

    await pipeline(part.file, createWriteStream(dest));
    const fsp = await import('node:fs/promises');
    const stats = await fsp.stat(dest);
    const size = stats.size;
    void lruEvict().catch(() => {});

    return {
      url: publicUrl(req, filename),
      filename,
      originalFilename: original,
      mimeType: mime,
      sizeBytes: size,
    };
  });

  app.get('/upload/file/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    // Path safety: only basename, no traversal.
    const safe = basename(filename);
    const path = join(UPLOAD_DIR, safe);
    if (!existsSync(path)) throw app.httpErrors.notFound(`No file: ${safe}`);
    const ext = extname(safe).toLowerCase();
    const mime =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.mov' ? 'video/quicktime' :
      ext === '.webm' ? 'video/webm' :
      ext === '.gif' ? 'image/gif' :
      ext === '.png' ? 'image/png' :
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.webp' ? 'image/webp' :
      ext === '.mp3' ? 'audio/mpeg' :
      ext === '.wav' ? 'audio/wav' :
      'application/octet-stream';
    reply.header('content-type', mime);
    reply.header('cache-control', 'public, max-age=300');
    return reply.send(createReadStream(path));
  });

  app.get('/upload/list', async (req) => {
    await ensureDir();
    // ?include=outputs (default) | uploads | all
    const include = ((req.query as { include?: string })?.include ?? 'outputs').toLowerCase();
    const entries = await readdir(UPLOAD_DIR);
    const files = entries
      .filter((name) => {
        const isOutput = name.startsWith('out-');
        if (include === 'outputs') return isOutput;
        if (include === 'uploads') return !isOutput;
        return true; // 'all'
      })
      .map((name) => {
        try {
          const s = statSync(join(UPLOAD_DIR, name));
          return {
            name,
            sizeBytes: s.size,
            mtime: s.mtimeMs,
            url: publicUrl(req, name),
            kind: kindOf(name),
            ext: extname(name).slice(1).toLowerCase(),
            origin: name.startsWith('out-') ? 'output' as const : 'upload' as const,
          };
        } catch {
          return null;
        }
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => b.mtime - a.mtime);
    const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);
    return { files, count: files.length, totalBytes, include };
  });

  app.delete('/upload/file/:filename', async (req) => {
    const { filename } = req.params as { filename: string };
    const safe = basename(filename);
    const path = join(UPLOAD_DIR, safe);
    if (!existsSync(path)) throw app.httpErrors.notFound(`No file: ${safe}`);
    await rm(path, { force: true });
    return { ok: true, filename: safe };
  });
}

function kindOf(filename: string): 'image' | 'video' | 'audio' | 'other' {
  const ext = extname(filename).slice(1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg', 'flac'].includes(ext)) return 'audio';
  return 'other';
}

/** Resolve an http(s) URL OR a local upload URL into a local file path that
 *  ffmpeg can read. Used by media tools so they can accept either form. */
export async function resolveToLocal(urlOrPath: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (urlOrPath.startsWith('/api/upload/file/') || urlOrPath.includes('/api/upload/file/')) {
    const name = basename(new URL(urlOrPath, 'http://localhost').pathname);
    const path = join(UPLOAD_DIR, name);
    if (!existsSync(path)) throw new Error(`Upload not found: ${name}`);
    return { path, cleanup: async () => {} };
  }
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Fetch ${urlOrPath} → ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const guess = (() => {
      const u = new URL(urlOrPath);
      const ext = extname(u.pathname).toLowerCase();
      if (ext) return ext;
      const ct = res.headers.get('content-type') ?? '';
      if (ct.startsWith('video/')) return '.mp4';
      if (ct.startsWith('image/')) return '.png';
      if (ct.startsWith('audio/')) return '.mp3';
      return '.bin';
    })();
    const path = join(tmpdir(), `2in-fetch-${randomBytes(6).toString('hex')}${guess}`);
    await writeFile(path, buf);
    return { path, cleanup: async () => { await rm(path, { force: true }).catch(() => {}); } };
  }
  // Bare path — caller already gave us a local file.
  if (!existsSync(urlOrPath)) throw new Error(`Path not found: ${urlOrPath}`);
  return { path: urlOrPath, cleanup: async () => {} };
}

/** Tool outputs are prefixed `out-` so the Library can filter inputs out
 *  by default. Uploads from /api/upload (raw user files) get a bare hash. */
export function makeOutputPath(ext: string): { path: string; filename: string } {
  const filename = `out-${randomBytes(8).toString('hex')}${ext.startsWith('.') ? ext : `.${ext}`}`;
  return { path: join(UPLOAD_DIR, filename), filename };
}

export function uploadPublicUrl(req: FastifyRequest | { headers: Record<string, string | undefined>; protocol: string }, filename: string): string {
  // Used by media tools to construct the same URL shape as POST /upload.
  const headers = (req as { headers: Record<string, string | undefined> }).headers ?? {};
  const proto = (headers['x-forwarded-proto'] as string) ?? (req as { protocol: string }).protocol ?? 'http';
  const host = (headers['x-forwarded-host'] as string) ?? headers.host ?? 'localhost';
  return `${proto}://${host}/api/upload/file/${encodeURIComponent(filename)}`;
}
