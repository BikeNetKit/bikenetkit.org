import { browser } from '$app/environment';

const STORAGE_KEY = 'bnk:home-city';

let homeCitySlug = $state(browser ? localStorage.getItem(STORAGE_KEY) : null);
let coords = $state(null);

export const userLocation = {
	get homeCitySlug() {
		return homeCitySlug;
	},
	get coords() {
		return coords;
	},
	setHomeCity(slug) {
		homeCitySlug = slug;
		if (!browser) return;
		if (slug) localStorage.setItem(STORAGE_KEY, slug);
		else localStorage.removeItem(STORAGE_KEY);
	},
	setCoords(point) {
		coords = point;
	}
};
