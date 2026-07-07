// Isolated PDF→PNG rasterizer (runs in its own process to avoid a pdfjs version
// clash with extract.ts's pdfjs-dist). Usage: node render-worker.mjs <pdf> <outDir>
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pdf as pdfToImg } from 'pdf-to-img';

const [, , pdfPath, outDir] = process.argv;
await mkdir(outDir, { recursive: true });
const doc = await pdfToImg(await readFile(pdfPath), { scale: 1.5 });
let n = 0;
for await (const png of doc) {
  n += 1;
  await writeFile(`${outDir}/p${n}.png`, png);
}
process.stdout.write(String(n));
