export function downloadUrl(url, filename) {
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}

export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	downloadUrl(url, filename);
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadMarkdown(text, filename) {
	downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), filename);
}

function svgIntrinsicSize(svgText) {
	const widthAttr = svgText.match(/<svg[^>]*\bwidth="([\d.]+)(?:px)?"/i)?.[1];
	const heightAttr = svgText.match(/<svg[^>]*\bheight="([\d.]+)(?:px)?"/i)?.[1];
	if (widthAttr && heightAttr) {
		return { width: Number(widthAttr), height: Number(heightAttr) };
	}
	const viewBox = svgText.match(/viewBox="([\d.\s-]+)"/i)?.[1];
	if (viewBox) {
		const parts = viewBox.trim().split(/\s+/).map(Number);
		if (parts.length === 4) return { width: parts[2], height: parts[3] };
	}
	return { width: 512, height: 512 };
}

function loadImage(url) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = url;
	});
}

export async function svgToPng(svgText, { scale = 2, background = null } = {}) {
	const { width, height } = svgIntrinsicSize(svgText);
	// Inline the SVG as a same-origin blob URL so the canvas is never tainted
	// (the brand SVGs reference no external images), keeping toBlob() usable in Safari.
	const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	try {
		const img = await loadImage(url);
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(width * scale);
		canvas.height = Math.round(height * scale);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get a 2D canvas context');
		if (background) {
			ctx.fillStyle = background;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
		}
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
	} finally {
		URL.revokeObjectURL(url);
	}
}
