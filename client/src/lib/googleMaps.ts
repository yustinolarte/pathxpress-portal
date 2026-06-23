const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let _promise: Promise<void> | null = null;

/**
 * Loads the Google Maps JS API once, no matter how many components call this.
 * Both LocationPicker and OrdersMap import from here to avoid double-script errors.
 */
export function loadGoogleMaps(): Promise<void> {
    if (window.google?.maps) return Promise.resolve();
    if (_promise) return _promise;

    // Guard against a script tag already added by a prior render before this module loaded
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]') as HTMLScriptElement | null;
    if (existing) {
        _promise = new Promise<void>(resolve => {
            if (window.google?.maps) { resolve(); return; }
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => { _promise = null; resolve(); }, { once: true });
        });
        return _promise;
    }

    _promise = new Promise<void>(resolve => {
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => { _promise = null; resolve(); };
        document.head.appendChild(s);
    });
    return _promise;
}
