// node --test src/lib/hero-clip/timeline.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PHASES, frameAt, frameCount, phaseBounds } from './timeline.js';

const FPS = 60;

for (const total of [1, 2, 7, 840, 3000]) {
	test(`reveal walks -1 → ${total - 1} → -1 (total ${total})`, () => {
		const n = frameCount(FPS);
		const { buildStart, buildEnd, teardownStart, teardownEnd } = phaseBounds(DEFAULT_PHASES);
		let prev = -1;
		let sawLast = false;
		for (let i = 0; i < n; i++) {
			const t = i / FPS;
			const { reveal } = frameAt(i, { fps: FPS, total });
			assert.ok(reveal >= -1 && reveal <= total - 1, `frame ${i}: reveal ${reveal} out of range`);
			if (t < buildStart) assert.equal(reveal, -1);
			if (t >= buildStart && t < buildEnd) assert.ok(reveal >= prev, `build regressed at ${i}`);
			if (t >= buildEnd && t < teardownStart) assert.equal(reveal, total - 1);
			if (t >= teardownStart && t < teardownEnd)
				assert.ok(reveal <= prev, `tear-down grew at ${i}`);
			if (t >= teardownEnd) assert.equal(reveal, -1);
			if (reveal === total - 1) sawLast = true;
			prev = reveal;
		}
		assert.ok(sawLast);
	});
}

test('clip starts and ends on white, and is fully opaque in between', () => {
	const n = frameCount(FPS);
	assert.equal(n, 14 * FPS);
	assert.equal(frameAt(0, { fps: FPS, total: 10 }).opacity, 0);
	assert.ok(frameAt(n - 1, { fps: FPS, total: 10 }).opacity < 0.02);
	assert.equal(frameAt(n, { fps: FPS, total: 10 }).opacity, 0);
	assert.equal(frameAt(5 * FPS, { fps: FPS, total: 10 }).opacity, 1);
});

test('camera: bearing is linear, zoom swoops in and out around a monotonic creep', () => {
	const a = frameAt(0, { fps: FPS, total: 10, orbitSpeed: 3 });
	const b = frameAt(FPS * 2, { fps: FPS, total: 10, orbitSpeed: 3 });
	assert.equal(a.bearing, 0);
	assert.equal(b.bearing, 6);
	assert.ok(a.zoom < 0, 'starts pulled back');
	assert.ok(Math.abs(frameAt(FPS * 8, { fps: FPS, total: 10 }).zoom) < 1e-9, 'fitted mid-hold');
	const mid = frameAt(FPS * 7, { fps: FPS, total: 10 });
	const later = frameAt(FPS * 12, { fps: FPS, total: 10 });
	assert.ok(later.zoom >= mid.zoom);
	assert.ok(frameAt(frameCount(FPS), { fps: FPS, total: 10 }).zoom > later.zoom, 'ends pushed in');
});
