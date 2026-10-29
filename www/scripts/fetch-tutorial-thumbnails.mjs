// One-off authoring step, not part of the build: download each tool's YouTube thumbnail and commit
// it as webp, so the tool page's tutorial teaser never loads anything from a YouTube origin at
// runtime. Rerun after adding a tutorial to tools.json, or after a custom thumbnail is set on
// YouTube.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const tools = JSON.parse(readFileSync(path.join(root, 'src/lib/data/tools.json'), 'utf8'));
const outDir = path.join(root, 'src/lib/assets/media/tutorials');
mkdirSync(outDir, { recursive: true });
const EDGE_CROP = 0.065;

for (const tool of tools.filter((t) => t.tutorial)) {
	const id = new URL(tool.tutorial).searchParams.get('v');
	let image;
	// maxresdefault is missing for some low-resolution uploads; hqdefault always exists.
	for (const quality of ['maxresdefault', 'hqdefault']) {
		const res = await fetch(`https://i.ytimg.com/vi/${id}/${quality}.jpg`);
		if (res.ok) {
			image = Buffer.from(await res.arrayBuffer());
			break;
		}
	}
	if (!image) throw new Error(`${tool.slug}: no thumbnail for video ${id}`);
	const file = path.join(outDir, `${tool.slug}.webp`);
	// The screencasts are narrower than 16:9, so YouTube pads them with a blurred copy of the edge,
	// about 5% of the width on either side. Cut that off; the teaser's object-cover does the rest.
	const { width, height } = await sharp(image).metadata();
	const inset = Math.round(width * EDGE_CROP);
	const { size } = await sharp(image)
		.extract({ left: inset, top: 0, width: width - 2 * inset, height })
		.resize({ width: 960, withoutEnlargement: true })
		.webp({ quality: 80 })
		.toFile(file);
	console.log(
		`${tool.slug}: ${id} -> ${path.relative(root, file)} (${Math.round(size / 1024)} KB)`
	);
}
