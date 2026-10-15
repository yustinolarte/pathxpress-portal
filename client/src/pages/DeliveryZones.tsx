import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { MapPin, Search, ZoomIn } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead, { createBreadcrumbSchema } from '@/components/SEOHead';
import { loadGoogleMaps } from '@/lib/googleMaps';
import zonesRaw from '../../../server/zones/delivery-zones.geojson?raw';
import uaeRaw from '../../../shared/uae-outline.geojson?raw';

type ZoneProperties = {
  area_name: string;
  zone_code: 1 | 2;
  zone_name: string;
};
type ZoneFeature = Feature<Polygon, ZoneProperties>;
type Selection = { zone: 1 | 2 | 3; area?: string; address?: string } | { outside: true };

const zoneFeatures = (JSON.parse(zonesRaw) as { features: ZoneFeature[] }).features;
const uae = JSON.parse(uaeRaw) as Feature<MultiPolygon>;
const areas = [
  { name: 'Abu Dhabi', source: 'Abu Dhabi Urban', zone: 1 },
  { name: 'Dubai', source: 'Dubai Urban', zone: 1 },
  { name: 'Sharjah', source: 'Sharjah Urban', zone: 1 },
  { name: 'Ajman', source: 'Ajman Urban', zone: 1 },
  { name: 'Al Ain', source: 'Al Ain Urban', zone: 2 },
  { name: 'Fujairah', source: 'Fujairah Urban', zone: 2 },
  { name: 'Umm Al Quwain', source: 'Umm Al Quwain Urban', zone: 2 },
  { name: 'Ras Al Khaimah', source: 'Ras Al Khaimah Urban', zone: 2 },
] as const;
const UAE_BOUNDS = { south: 22.55, west: 51.45, north: 26.1, east: 56.65 };

function zoneAt(lat: number, lng: number): Selection {
  const point: [number, number] = [lng, lat];
  if (!booleanPointInPolygon(point, uae)) return { outside: true };
  const match = zoneFeatures.find(feature => booleanPointInPolygon(point, feature));
  return match
    ? { zone: match.properties.zone_code, area: match.properties.area_name.replace(' Urban', '') }
    : { zone: 3 };
}

export default function DeliveryZones() {
  const embedded = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';
  const mapElement = useRef<HTMLDivElement>(null);
  const searchElement = useRef<HTMLInputElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const pin = useRef<google.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [activeArea, setActiveArea] = useState('Dubai');
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let disposed = false;
    const overlays: google.maps.Polygon[] = [];
    const listeners: google.maps.MapsEventListener[] = [];

    loadGoogleMaps().then(() => {
      if (disposed) return;
      if (!window.google?.maps || !mapElement.current) {
        setError('The map could not load. Please try again later.');
        return;
      }

      const gmap = new google.maps.Map(mapElement.current, {
        center: { lat: 24.5, lng: 54.5 },
        zoom: 7,
        mapTypeId: 'roadmap',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'cooperative',
      });
      map.current = gmap;
      // Start at a useful street-level regional view; customers can switch to any area.
      gmap.setCenter({ lat: 25.13, lng: 55.25 });
      gmap.setZoom(10);

      // The country is the neutral Zone 3 base; Zone 1 and 2 polygons sit over it.
      for (const polygon of uae.geometry.coordinates) {
        const layer = new google.maps.Polygon({
          paths: polygon.map(ring => ring.map(([lng, lat]) => ({ lat, lng }))),
          strokeColor: '#6B6F77',
          strokeWeight: 1.5,
          strokeOpacity: 0.65,
          fillColor: '#6B6F77',
          fillOpacity: 0.11,
          clickable: false,
          map: gmap,
        });
        overlays.push(layer);
      }
      for (const feature of zoneFeatures) {
        const zone = feature.properties.zone_code;
        const color = zone === 1 ? '#E10600' : '#16181C';
        const layer = new google.maps.Polygon({
          paths: feature.geometry.coordinates.map(ring => ring.map(([lng, lat]) => ({ lat, lng }))),
          strokeColor: color,
          strokeWeight: 3,
          strokeOpacity: 1,
          fillColor: color,
          fillOpacity: zone === 1 ? 0.26 : 0.22,
          clickable: false,
          map: gmap,
        });
        overlays.push(layer);
      }

      const selectPoint = (lat: number, lng: number, address?: string) => {
        const result = zoneAt(lat, lng);
        setSelection('outside' in result ? result : { ...result, address });
        pin.current?.setMap(null);
        pin.current = new google.maps.Marker({
          map: gmap,
          position: { lat, lng },
          title: address || 'Selected location',
        });
      };
      listeners.push(gmap.addListener('click', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) selectPoint(event.latLng.lat(), event.latLng.lng());
      }));

      if (searchElement.current && google.maps.places?.Autocomplete) {
        const autocomplete = new google.maps.places.Autocomplete(searchElement.current, {
          componentRestrictions: { country: 'ae' },
          fields: ['geometry', 'formatted_address', 'name'],
        });
        listeners.push(autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const location = place.geometry?.location;
          if (!location) return;
          const lat = location.lat();
          const lng = location.lng();
          gmap.setCenter({ lat, lng });
          gmap.setZoom(14);
          setActiveArea('');
          selectPoint(lat, lng, place.formatted_address || place.name);
        }));
      }
      setReady(true);
    }).catch(() => {
      if (!disposed) setError('The map could not load. Please try again later.');
    });

    return () => {
      disposed = true;
      listeners.forEach(listener => listener.remove());
      overlays.forEach(layer => layer.setMap(null));
      pin.current?.setMap(null);
      map.current = null;
    };
  }, []);

  const focusArea = (name: string, source?: string) => {
    if (!map.current) return;
    setActiveArea(name);
    setSelection(null);
    pin.current?.setMap(null);
    if (!source) {
      map.current.fitBounds(UAE_BOUNDS);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const feature of zoneFeatures.filter(item => item.properties.area_name === source)) {
      for (const ring of feature.geometry.coordinates) {
        for (const [lng, lat] of ring) bounds.extend({ lat, lng });
      }
    }
    map.current.fitBounds(bounds, 60);
  };

  return (
    <div className="min-h-screen bg-[#F4F3EF] text-[#16181C]">
      {!embedded && <div className="fixed inset-x-0 top-0 z-40 h-[76px] bg-[#16181C]" aria-hidden="true" />}
      {!embedded && <SEOHead
        title="UAE Delivery Zone Map | PATHXPRESS"
        description="Explore the exact PathXpress UAE delivery-zone boundaries. Zoom into your area or search an address to see its zone."
        canonical="https://pathxpress.net/delivery-zones"
        schema={createBreadcrumbSchema([
          { name: 'Home', url: 'https://pathxpress.net/' },
          { name: 'Delivery Zones', url: 'https://pathxpress.net/delivery-zones' },
        ])}
      />}
      {!embedded && <Header />}
      <main className={embedded ? 'p-4' : 'pt-28 pb-16'}>
        <div className={embedded ? 'mx-auto max-w-[1500px]' : 'container max-w-[1500px]'}>
          {!embedded && <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#E10600]">PathXpress coverage</p>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight">Explore our UAE delivery zones</h1>
            <p className="mt-3 max-w-3xl text-base md:text-lg text-[#51545A]">
              Zoom in to see the exact boundaries on the street map. Search an address or click a location to find its delivery zone.
            </p>
          </div>}
          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="rounded-2xl border border-[#D7D7D5] bg-white p-5 shadow-sm">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-5 w-5 text-[#6B6F77]" />
                <input
                  ref={searchElement}
                  type="search"
                  placeholder="Search an address in UAE"
                  aria-label="Search an address in UAE"
                  className="w-full rounded-xl border border-[#C9CACC] bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-[#E10600]"
                />
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-widest text-[#6B6F77]">Jump to an area</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => focusArea('All UAE')} className={`col-span-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${activeArea === 'All UAE' ? 'border-[#E10600] bg-[#FFF0EF] text-[#B52200]' : 'border-[#D7D7D5] hover:border-[#E10600]'}`}>
                  All UAE
                </button>
                {areas.map(area => (
                  <button
                    key={area.name}
                    type="button"
                    onClick={() => focusArea(area.name, area.source)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${activeArea === area.name ? 'border-[#E10600] bg-[#FFF0EF] text-[#B52200]' : 'border-[#D7D7D5] hover:border-[#E10600]'}`}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
              <div className="mt-6 border-t border-[#E2E2E0] pt-5">
                <p className="text-xs font-bold uppercase tracking-widest text-[#6B6F77]">Zone key</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start gap-3"><span className="mt-1 h-4 w-4 shrink-0 rounded-sm border-2 border-[#E10600] bg-[#E10600]/20" /><span><b>Zone 1</b><br />Red urban polygons</span></div>
                  <div className="flex items-start gap-3"><span className="mt-1 h-4 w-4 shrink-0 rounded-sm border-2 border-[#16181C] bg-[#16181C]/20" /><span><b>Zone 2</b><br />Charcoal urban polygons</span></div>
                  <div className="flex items-start gap-3"><span className="mt-1 h-4 w-4 shrink-0 rounded-sm border border-[#6B6F77] bg-[#6B6F77]/20" /><span><b>Zone 3</b><br />All other UAE locations outside Zones 1 and 2</span></div>
                </div>
              </div>
            </aside>
            <section className="min-w-0">
              <div className="relative overflow-hidden rounded-2xl border border-[#C9CACC] bg-[#E7E7E5] shadow-sm">
                <div ref={mapElement} className="h-[560px] w-full md:h-[720px]" role="application" aria-label="Interactive UAE delivery zone map" />
                {!ready && <div className="absolute inset-0 flex items-center justify-center bg-[#F4F3EF] text-[#51545A]">{error || 'Loading map…'}</div>}
                {ready && <div className="absolute left-4 top-4 rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold shadow"><ZoomIn className="mr-2 inline h-4 w-4 text-[#E10600]" />Zoom in for street-level boundaries</div>}
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#D7D7D5] bg-white p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#E10600]" />
                <div aria-live="polite">
                  {selection ? (
                    'outside' in selection ? (
                      <><p className="font-bold">Outside UAE coverage</p><p className="text-sm text-[#51545A]">Choose a location within the UAE to check its zone.</p></>
                    ) : (
                      <><p className="font-bold">Zone {selection.zone}{selection.area ? ` · ${selection.area}` : ''}</p><p className="text-sm text-[#51545A]">{selection.address || 'Selected map location'} is in Zone {selection.zone}.</p></>
                    )
                  ) : (
                    <><p className="font-bold">Check a delivery location</p><p className="text-sm text-[#51545A]">Search an address or click the map. The exact destination pin determines the zone.</p></>
                  )}
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6B6F77]">The colored boundaries use the same 11 polygons as the PathXpress portal. Streets and place names are provided by Google Maps.</p>
            </section>
          </div>
          {!embedded && <p className="mt-10 text-sm text-[#51545A]">Ready to ship? <Link href="/request-quote" className="font-semibold text-[#B52200] underline">Request a quote</Link> for your destination.</p>}
        </div>
      </main>
      {!embedded && <Footer />}
    </div>
  );
}
