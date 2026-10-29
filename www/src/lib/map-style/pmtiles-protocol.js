// Register the pmtiles:// protocol so MapLibre can read the basemap out of a single static
// archive via HTTP range requests — no tile server, nothing to keep running.
//
// Imported for its side effect by style.js, which every map component depends on. Module side
// effects run at import time, so the protocol is registered before any component mounts and
// asks MapLibre to resolve a style.
import { addProtocol } from 'maplibre-gl';
import { Protocol } from 'pmtiles';

if (typeof window !== 'undefined') {
	addProtocol('pmtiles', new Protocol().tile);
}
