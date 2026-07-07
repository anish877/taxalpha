import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const WORKER = fileURLToPath(new URL('./render-worker.mjs', import.meta.url));

/**
 * Rasterize PDF pages to PNG (base64) for the vision pass, keyed by 1-based page.
 *
 * Runs the rasterizer (pdf-to-img, which bundles its own pdfjs) in a SEPARATE
 * process so its pdfjs version can't clash with extract.ts's pdfjs-dist. Best-
 * effort: throws on failure and the caller falls back to text-only.
 */
export async function renderPages(pdf: Uint8Array): Promise<Map<number, string>> {
  const dir = await mkdtemp(join(tmpdir(), 'taxalpha-render-'));
  const pdfPath = join(dir, 'in.pdf');
  const outDir = join(dir, 'out');
  try {
    await writeFile(pdfPath, Buffer.from(pdf));
    await execFileP(process.execPath, [WORKER, pdfPath, outDir], { maxBuffer: 64 * 1024 * 1024 });
    const files = (await readdir(outDir)).filter((f) => /^p\d+\.png$/.test(f));
    const out = new Map<number, string>();
    for (const f of files) {
      const page = Number(f.match(/^p(\d+)\.png$/)![1]);
      out.set(page, (await readFile(join(outDir, f))).toString('base64'));
    }
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
