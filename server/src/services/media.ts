// Media (video + image) primitives backed by the ffmpeg-static binary.
// Adapted from germin's worker pipeline. All operations spawn the bundled
// ffmpeg, so no system install is required.
//
// Layout:
//   ffmpeg(args)             — promise wrapper around spawn
//   probeMeta(input)         — duration + dimensions + container info
//   trim / reframe / letterboxReframe / burnCaption / audioEnhance
//   sceneCuts / extractGif / thumbnailAt / concatVideos / compressVideo
//   resizeImage / cropImage / convertImage / watermarkImage
//
// Tools live in services/tools/media.ts and call into here.

import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { writeFile, rm, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (!ffmpegPath) {
  throw new Error('ffmpeg-static did not ship a binary for this platform');
}
const FFMPEG: string = ffmpegPath as unknown as string;

export type Aspect = '9:16' | '1:1' | '16:9';
export const ASPECT_SIZES: Record<Aspect, readonly [number, number]> = {
  '9:16': [1080, 1920],
  '1:1':  [1080, 1080],
  '16:9': [1920, 1080],
};

export function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-800)}`));
        return;
      }
      resolve();
    });
    p.on('error', reject);
  });
}

export interface MediaMeta {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  container: string | null;
}

/** Probe via `ffmpeg -i` (no ffprobe in ffmpeg-static). Parses stderr. */
export async function probeMeta(input: string): Promise<MediaMeta> {
  const stderr = await new Promise<string>((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-i', input], { stdio: ['ignore', 'ignore', 'pipe'] });
    let buf = '';
    p.stderr.on('data', (d) => { buf += d.toString(); });
    p.on('close', () => resolve(buf));
    p.on('error', reject);
  });
  const dur = stderr.match(/Duration:\s+(\d+):(\d+):(\d+\.\d+)/);
  const dims = stderr.match(/,\s*(\d{2,5})x(\d{2,5})\b/);
  const container = stderr.match(/Input #0,\s*([^,]+),/);
  return {
    durationSec: dur ? +dur[1]! * 3600 + +dur[2]! * 60 + +dur[3]! : null,
    width: dims ? +dims[1]! : null,
    height: dims ? +dims[2]! : null,
    container: container ? container[1]!.trim() : null,
  };
}

// ====================== VIDEO ======================

export async function trimVideo(input: string, start: number, end: number, output: string): Promise<void> {
  if (!(end > start)) throw new Error(`trimVideo: end (${end}) must be > start (${start})`);
  await ffmpeg([
    '-y',
    '-ss', String(start),
    '-to', String(end),
    '-i', input,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    output,
  ]);
}

export async function reframeVideo(input: string, output: string, aspect: Aspect): Promise<void> {
  const [w, h] = ASPECT_SIZES[aspect];
  await ffmpeg([
    '-y',
    '-i', input,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    output,
  ]);
}

export async function letterboxReframe(input: string, output: string, aspect: Aspect): Promise<void> {
  const [tw, th] = ASPECT_SIZES[aspect];
  const filter =
    `[0:v]split=2[bg][fg];` +
    `[bg]scale=${tw}:${th}:force_original_aspect_ratio=increase,` +
    `crop=${tw}:${th},gblur=sigma=24,` +
    `eq=brightness=-0.12:saturation=0.85[bgblur];` +
    `[fg]scale=${tw}:${th}:force_original_aspect_ratio=decrease[fgfit];` +
    `[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2`;
  await ffmpeg([
    '-y',
    '-i', input,
    '-filter_complex', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k',
    output,
  ]);
}

function sanitizeText(s: string): string {
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function burnCaption(input: string, caption: string, output: string, opts: { fontSize?: number; position?: 'bottom' | 'top' | 'center' } = {}): Promise<void> {
  const fontSize = opts.fontSize ?? 56;
  const yExpr = opts.position === 'top' ? '80'
    : opts.position === 'center' ? '(h-text_h)/2'
    : 'h-th-80';
  const capPath = join(tmpdir(), `2in-cap-${randomBytes(6).toString('hex')}.txt`);
  await writeFile(capPath, sanitizeText(caption), 'utf8');
  try {
    await ffmpeg([
      '-y',
      '-i', input,
      '-vf',
      `drawtext=textfile='${capPath}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.6:boxborderw=18:x=(w-text_w)/2:y=${yExpr}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      output,
    ]);
  } finally {
    await rm(capPath, { force: true }).catch(() => {});
  }
}

export async function audioEnhance(input: string, output: string): Promise<void> {
  await ffmpeg([
    '-y',
    '-i', input,
    '-af', 'afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    output,
  ]);
}

/** Detect scene-change timestamps. Threshold ~0.35 = professional editor sensitivity. */
export async function sceneCuts(input: string, threshold = 0.35): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, [
      '-hide_banner', '-i', input,
      '-vf', `select='gt(scene,${threshold})',showinfo`,
      '-an', '-f', 'null', '-',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d.toString(); });
    p.on('close', () => {
      const cuts: number[] = [];
      const re = /pts_time:(\d+\.?\d*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stderr)) !== null) cuts.push(Number(m[1]));
      resolve(cuts.sort((a, b) => a - b));
    });
    p.on('error', reject);
  });
}

export async function extractGif(input: string, start: number, durationSec: number, output: string, opts: { width?: number; fps?: number } = {}): Promise<void> {
  const width = opts.width ?? 480;
  const fps = opts.fps ?? 12;
  // Two-pass via filter complex: generate palette inline, then use it.
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
  await ffmpeg([
    '-y',
    '-ss', String(start),
    '-t',  String(durationSec),
    '-i',  input,
    '-vf', filter,
    '-loop', '0',
    output,
  ]);
}

export async function thumbnailAt(input: string, t: number, output: string, opts: { width?: number } = {}): Promise<void> {
  const width = opts.width ?? 1280;
  await ffmpeg([
    '-y',
    '-ss', String(t),
    '-i', input,
    '-frames:v', '1',
    '-vf', `scale=${width}:-1`,
    '-q:v', '2',
    output,
  ]);
}

export async function concatVideos(inputs: string[], output: string): Promise<void> {
  if (inputs.length === 0) throw new Error('concatVideos: no inputs');
  if (inputs.length === 1) {
    await ffmpeg(['-y', '-i', inputs[0]!, '-c', 'copy', output]);
    return;
  }
  const listPath = join(tmpdir(), `2in-concat-${randomBytes(6).toString('hex')}.txt`);
  const list = inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, list, 'utf8');
  try {
    await ffmpeg([
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      output,
    ]);
  } finally {
    await rm(listPath, { force: true }).catch(() => {});
  }
}

export async function compressVideo(input: string, output: string, opts: { crf?: number; preset?: string } = {}): Promise<void> {
  const crf = opts.crf ?? 28;
  const preset = opts.preset ?? 'medium';
  await ffmpeg([
    '-y',
    '-i', input,
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    output,
  ]);
}

// ====================== IMAGE ======================

export async function resizeImage(input: string, output: string, w: number | null, h: number | null): Promise<void> {
  if (w == null && h == null) throw new Error('resizeImage: width or height required');
  const wExpr = w == null ? '-1' : String(w);
  const hExpr = h == null ? '-1' : String(h);
  await ffmpeg([
    '-y',
    '-i', input,
    '-vf', `scale=${wExpr}:${hExpr}`,
    output,
  ]);
}

export async function cropImage(input: string, output: string, w: number, h: number, x: number, y: number): Promise<void> {
  await ffmpeg([
    '-y',
    '-i', input,
    '-vf', `crop=${w}:${h}:${x}:${y}`,
    output,
  ]);
}

export async function convertImage(input: string, output: string): Promise<void> {
  // Format inferred from output file extension. ffmpeg handles png/jpg/webp/bmp/tiff.
  await ffmpeg(['-y', '-i', input, output]);
}

/** Apply an arbitrary (whitelisted) ffmpeg filter chain to an image.
 *  Filter names are validated against ALLOWED_FILTERS; argument values are
 *  validated against a permissive but safe regex. Anything else throws.
 *  This is the engine behind image.edit — Qwen produces the filter
 *  string, we execute it. */
const ALLOWED_FILTERS = new Set([
  'eq', 'hue', 'colorbalance', 'colorize', 'colorchannelmixer',
  'gblur', 'unsharp', 'boxblur', 'vignette', 'negate', 'noise',
  'curves', 'lutyuv', 'lut', 'fade', 'edgedetect', 'pixelize',
]);
// Allow filter args containing letters/digits/=, +, -, ., :, /, *, comma is the
// inter-filter separator handled outside this regex.
const ARG_SAFE = /^[A-Za-z0-9_=:.\-+/* ]*$/;

export function validateFilterChain(chain: string): { ok: true; cleaned: string } | { ok: false; reason: string } {
  // Strip outer whitespace + trailing semicolons.
  const trimmed = chain.trim().replace(/^[`'"]+|[`'"]+$/g, '').replace(/[;,]+$/, '');
  if (!trimmed) return { ok: false, reason: 'empty filter' };
  // ffmpeg uses `,` for chain separator and `;` for filter graph branches.
  // We allow both but require each segment matches `name` or `name=args`.
  const segments = trimmed.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { ok: false, reason: 'no filters parsed' };
  if (segments.length > 8) return { ok: false, reason: 'too many filters (max 8)' };
  for (const seg of segments) {
    const m = seg.match(/^([a-zA-Z][a-zA-Z0-9_]*)(?:=(.*))?$/);
    if (!m) return { ok: false, reason: `bad segment "${seg}"` };
    const [, name, args] = m;
    if (!ALLOWED_FILTERS.has(name!)) return { ok: false, reason: `filter "${name}" not allowed` };
    if (args && !ARG_SAFE.test(args)) return { ok: false, reason: `unsafe args in "${seg}"` };
  }
  return { ok: true, cleaned: segments.join(',') };
}

export async function applyImageFilter(input: string, output: string, filterChain: string): Promise<void> {
  const v = validateFilterChain(filterChain);
  if (!v.ok) throw new Error(`invalid filter chain: ${v.reason}`);
  await ffmpeg(['-y', '-i', input, '-vf', v.cleaned, '-frames:v', '1', output]);
}

export async function watermarkImage(input: string, output: string, text: string, opts: { fontSize?: number; opacity?: number; position?: 'tl' | 'tr' | 'bl' | 'br' | 'center' } = {}): Promise<void> {
  const fontSize = opts.fontSize ?? 36;
  const opacity = opts.opacity ?? 0.55;
  const pos = opts.position ?? 'br';
  const xy = pos === 'tl' ? 'x=20:y=20'
    : pos === 'tr' ? 'x=w-tw-20:y=20'
    : pos === 'bl' ? 'x=20:y=h-th-20'
    : pos === 'center' ? 'x=(w-tw)/2:y=(h-th)/2'
    : 'x=w-tw-20:y=h-th-20';
  const capPath = join(tmpdir(), `2in-wm-${randomBytes(6).toString('hex')}.txt`);
  await writeFile(capPath, sanitizeText(text), 'utf8');
  try {
    await ffmpeg([
      '-y',
      '-i', input,
      '-vf', `drawtext=textfile='${capPath}':fontcolor=white@${opacity}:fontsize=${fontSize}:${xy}`,
      output,
    ]);
  } finally {
    await rm(capPath, { force: true }).catch(() => {});
  }
}

/** Best-effort file size readback for tools' return shape. */
export async function fileSize(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return 0;
  }
}
