import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, RotateCcw, Zap, Clock, Fuel, MapPin, TrafficCone, Package, Route, Brain, Pause, Check, X, Truck, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Declare L as global (loaded from CDN)
declare const L: any;

// Dubai delivery route - 10 stops covering major areas
const WAREHOUSE_LOCATION = { lat: 25.2048, lng: 55.2708, name: 'Central Warehouse - Downtown Dubai' };

const DELIVERY_STOPS = [
    { lat: 25.2576, lng: 55.3047, name: 'Deira City Centre' },
    { lat: 25.2285, lng: 55.2867, name: 'Dubai Creek' },
    { lat: 25.1972, lng: 55.2744, name: 'Business Bay' },
    { lat: 25.2175, lng: 55.2542, name: 'DIFC' },
    { lat: 25.1858, lng: 55.2625, name: 'Downtown Dubai' },
    { lat: 25.1367, lng: 55.1834, name: 'Jumeirah' },
    { lat: 25.0772, lng: 55.1386, name: 'Dubai Marina' },
    { lat: 25.0657, lng: 55.1356, name: 'JBR Walk' },
    { lat: 25.0865, lng: 55.1518, name: 'Media City' },
    { lat: 25.1012, lng: 55.1678, name: 'Internet City' },
];

// Traditional route - inefficient order (goes back and forth)
const TRADITIONAL_ROUTE = [
    WAREHOUSE_LOCATION,
    { lat: 25.2200, lng: 55.2780 },
    { lat: 25.2350, lng: 55.2900 },
    { lat: 25.2500, lng: 55.3000 },
    { lat: 25.2576, lng: 55.3047 },
    { lat: 25.2400, lng: 55.2950 },
    { lat: 25.2285, lng: 55.2867 },
    { lat: 25.2100, lng: 55.2700 },
    { lat: 25.1972, lng: 55.2744 },
    { lat: 25.2050, lng: 55.2650 },
    { lat: 25.2175, lng: 55.2542 },
    { lat: 25.2000, lng: 55.2580 },
    { lat: 25.1858, lng: 55.2625 },
    { lat: 25.1700, lng: 55.2400 },
    { lat: 25.1550, lng: 55.2200 },
    { lat: 25.1400, lng: 55.2000 },
    { lat: 25.1367, lng: 55.1834 },
    { lat: 25.1200, lng: 55.1700 },
    { lat: 25.1000, lng: 55.1550 },
    { lat: 25.0850, lng: 55.1450 },
    { lat: 25.0772, lng: 55.1386 },
    { lat: 25.0700, lng: 55.1370 },
    { lat: 25.0657, lng: 55.1356 },
    { lat: 25.0750, lng: 55.1400 },
    { lat: 25.0800, lng: 55.1480 },
    { lat: 25.0865, lng: 55.1518 },
    { lat: 25.0920, lng: 55.1580 },
    { lat: 25.0970, lng: 55.1640 },
    { lat: 25.1012, lng: 55.1678 },
];

// AI optimized route - efficient clustering and order
const AI_ROUTE = [
    WAREHOUSE_LOCATION,
    { lat: 25.2000, lng: 55.2680 },
    { lat: 25.1972, lng: 55.2744 },
    { lat: 25.1900, lng: 55.2680 },
    { lat: 25.1858, lng: 55.2625 },
    { lat: 25.2000, lng: 55.2580 },
    { lat: 25.2175, lng: 55.2542 },
    { lat: 25.2230, lng: 55.2700 },
    { lat: 25.2285, lng: 55.2867 },
    { lat: 25.2430, lng: 55.2960 },
    { lat: 25.2576, lng: 55.3047 },
    { lat: 25.2300, lng: 55.2500 },
    { lat: 25.1800, lng: 55.2200 },
    { lat: 25.1500, lng: 55.1900 },
    { lat: 25.1367, lng: 55.1834 },
    { lat: 25.1100, lng: 55.1700 },
    { lat: 25.1012, lng: 55.1678 },
    { lat: 25.0940, lng: 55.1600 },
    { lat: 25.0865, lng: 55.1518 },
    { lat: 25.0810, lng: 55.1450 },
    { lat: 25.0772, lng: 55.1386 },
    { lat: 25.0710, lng: 55.1370 },
    { lat: 25.0657, lng: 55.1356 },
];

const TRADITIONAL_METRICS = { km: 72, time: 95, fuel: 14.4, stops: 10 };
const AI_METRICS = { km: 41, time: 48, fuel: 8.2, stops: 10 };

interface RouteSimulationProps {
    className?: string;
}

export default function RouteSimulation({ className = '' }: RouteSimulationProps) {
    const { t } = useTranslation();
    const traditionalMapRef = useRef<HTMLDivElement>(null);
    const aiMapRef = useRef<HTMLDivElement>(null);
    const [traditionalMap, setTraditionalMap] = useState<any>(null);
    const [aiMap, setAiMap] = useState<any>(null);
    const [isSimulating, setIsSimulating] = useState(false);
    const [showTraffic, setShowTraffic] = useState(false);
    const [traditionalVehicle, setTraditionalVehicle] = useState<any>(null);
    const [aiVehicle, setAiVehicle] = useState<any>(null);
    const [traditionalProgress, setTraditionalProgress] = useState(0);
    const [aiProgress, setAiProgress] = useState(0);
    const [traditionalStatus, setTraditionalStatus] = useState<'waiting' | 'running' | 'completed'>('waiting');
    const [aiStatus, setAiStatus] = useState<'waiting' | 'running' | 'completed'>('waiting');
    const [currentMetrics, setCurrentMetrics] = useState({
        traditional: { km: 0, time: 0, fuel: 0, stops: 0 },
        ai: { km: 0, time: 0, fuel: 0, stops: 0 },
    });
    const [savings, setSavings] = useState({ km: '--', time: '--', fuel: '--', percent: '--' });
    const animationRef = useRef<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [mapsLoaded, setMapsLoaded] = useState(false);
    const trafficLayersRef = useRef<any[]>([]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (isMobile || !traditionalMapRef.current || !aiMapRef.current || typeof L === 'undefined') return;

        const mapCenter: [number, number] = [25.15, 55.22];
        const mapZoom = 11;

        const tMap = L.map(traditionalMapRef.current, {
            center: mapCenter,
            zoom: mapZoom,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(tMap);

        const aMap = L.map(aiMapRef.current, {
            center: mapCenter,
            zoom: mapZoom,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(aMap);

        const traditionalLatLngs = TRADITIONAL_ROUTE.map(p => [p.lat, p.lng]);
        const aiLatLngs = AI_ROUTE.map(p => [p.lat, p.lng]);

        L.polyline(traditionalLatLngs, {
            color: '#64748b',
            weight: 4,
            opacity: 0.8,
            dashArray: '10, 10'
        }).addTo(tMap);

        L.polyline(aiLatLngs, {
            color: '#e53935',
            weight: 5,
            opacity: 0.9
        }).addTo(aMap);

        // Warehouse marker with Lucide Warehouse icon SVG
        const warehouseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/></svg>`;

        const warehouseIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.5);">${warehouseSvg}</div>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
        });

        L.marker([WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng], { icon: warehouseIcon }).addTo(tMap);
        L.marker([WAREHOUSE_LOCATION.lat, WAREHOUSE_LOCATION.lng], { icon: warehouseIcon }).addTo(aMap);

        DELIVERY_STOPS.forEach((stop, i) => {
            const traditionalMarkerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #64748b; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.3);">${i + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });

            const aiMarkerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: linear-gradient(135deg, #e53935, #c62828); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; border: 2px solid white; box-shadow: 0 2px 10px rgba(229, 57, 53, 0.4);">${i + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });

            L.marker([stop.lat, stop.lng], { icon: traditionalMarkerIcon }).addTo(tMap);
            L.marker([stop.lat, stop.lng], { icon: aiMarkerIcon }).addTo(aMap);
        });

        // Vehicle marker with Lucide Truck icon SVG
        const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;

        const tVehicle = L.marker([TRADITIONAL_ROUTE[0].lat, TRADITIONAL_ROUTE[0].lng], {
            icon: L.divIcon({
                className: 'vehicle-marker',
                html: `<div style="background: #1e293b; padding: 6px; border-radius: 8px; border: 2px solid #64748b; color: #64748b; filter: drop-shadow(0 3px 6px rgba(0,0,0,0.4));">${truckSvg}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
            }),
            zIndexOffset: 1000,
        }).addTo(tMap);

        const aVehicle = L.marker([AI_ROUTE[0].lat, AI_ROUTE[0].lng], {
            icon: L.divIcon({
                className: 'vehicle-marker',
                html: `<div style="background: #1e293b; padding: 6px; border-radius: 8px; border: 2px solid #e53935; color: #e53935; filter: drop-shadow(0 3px 6px rgba(229, 57, 53, 0.5));">${truckSvg}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
            }),
            zIndexOffset: 1000,
        }).addTo(aMap);

        setTraditionalMap(tMap);
        setAiMap(aMap);
        setTraditionalVehicle(tVehicle);
        setAiVehicle(aVehicle);
        setMapsLoaded(true);

        return () => {
            tMap.remove();
            aMap.remove();
        };
    }, [isMobile]);

    const toggleTraffic = useCallback(() => {
        if (!traditionalMap || !aiMap) return;

        setShowTraffic(prev => {
            const newValue = !prev;

            if (newValue) {
                const trafficZones = [
                    { lat: 25.22, lng: 55.28, radius: 1000 },
                    { lat: 25.18, lng: 55.24, radius: 800 },
                    { lat: 25.15, lng: 55.20, radius: 700 },
                    { lat: 25.09, lng: 55.15, radius: 900 },
                ];

                trafficZones.forEach(zone => {
                    const circle1 = L.circle([zone.lat, zone.lng], {
                        radius: zone.radius,
                        color: '#ff6b6b',
                        fillColor: '#ff6b6b',
                        fillOpacity: 0.25,
                        weight: 2,
                    }).addTo(traditionalMap);

                    const circle2 = L.circle([zone.lat, zone.lng], {
                        radius: zone.radius,
                        color: '#ff6b6b',
                        fillColor: '#ff6b6b',
                        fillOpacity: 0.25,
                        weight: 2,
                    }).addTo(aiMap);

                    trafficLayersRef.current.push(circle1, circle2);
                });
            } else {
                trafficLayersRef.current.forEach(layer => {
                    traditionalMap.removeLayer(layer);
                    aiMap.removeLayer(layer);
                });
                trafficLayersRef.current = [];
            }

            return newValue;
        });
    }, [traditionalMap, aiMap]);

    const getPositionAtProgress = (route: typeof TRADITIONAL_ROUTE, progress: number) => {
        const totalSegments = route.length - 1;
        const segmentProgress = progress * totalSegments;
        const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
        const segmentFraction = segmentProgress - segmentIndex;

        const start = route[segmentIndex];
        const end = route[Math.min(segmentIndex + 1, route.length - 1)];

        return {
            lat: start.lat + (end.lat - start.lat) * segmentFraction,
            lng: start.lng + (end.lng - start.lng) * segmentFraction,
        };
    };

    const startSimulation = useCallback(() => {
        if (!traditionalVehicle || !aiVehicle || isSimulating) return;

        setIsSimulating(true);
        setTraditionalStatus('running');
        setAiStatus('running');
        setTraditionalProgress(0);
        setAiProgress(0);
        setSavings({ km: '--', time: '--', fuel: '--', percent: '--' });

        let tProgress = 0;
        let aProgress = 0;
        const tSpeed = 0.002;
        const aSpeed = 0.004;

        const animate = () => {
            if (tProgress < 1) {
                tProgress = Math.min(tProgress + tSpeed, 1);
                setTraditionalProgress(tProgress * 100);

                const pos = getPositionAtProgress(TRADITIONAL_ROUTE, tProgress);
                traditionalVehicle.setLatLng([pos.lat, pos.lng]);

                setCurrentMetrics(prev => ({
                    ...prev,
                    traditional: {
                        km: Math.round(TRADITIONAL_METRICS.km * tProgress),
                        time: Math.round(TRADITIONAL_METRICS.time * tProgress),
                        fuel: +(TRADITIONAL_METRICS.fuel * tProgress).toFixed(1),
                        stops: Math.min(Math.floor(tProgress * 10) + 1, 10),
                    },
                }));
            } else if (traditionalStatus !== 'completed') {
                setTraditionalStatus('completed');
                setCurrentMetrics(prev => ({
                    ...prev,
                    traditional: TRADITIONAL_METRICS,
                }));
            }

            if (aProgress < 1) {
                aProgress = Math.min(aProgress + aSpeed, 1);
                setAiProgress(aProgress * 100);

                const pos = getPositionAtProgress(AI_ROUTE, aProgress);
                aiVehicle.setLatLng([pos.lat, pos.lng]);

                setCurrentMetrics(prev => ({
                    ...prev,
                    ai: {
                        km: Math.round(AI_METRICS.km * aProgress),
                        time: Math.round(AI_METRICS.time * aProgress),
                        fuel: +(AI_METRICS.fuel * aProgress).toFixed(1),
                        stops: Math.min(Math.floor(aProgress * 10) + 1, 10),
                    },
                }));
            } else if (aiStatus !== 'completed') {
                setAiStatus('completed');
                setCurrentMetrics(prev => ({
                    ...prev,
                    ai: AI_METRICS,
                }));
            }

            if (tProgress < 1 || aProgress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setIsSimulating(false);
                setSavings({
                    km: `${TRADITIONAL_METRICS.km - AI_METRICS.km} km`,
                    time: `${TRADITIONAL_METRICS.time - AI_METRICS.time} min`,
                    fuel: `${(TRADITIONAL_METRICS.fuel - AI_METRICS.fuel).toFixed(1)} L`,
                    percent: `${Math.round(((TRADITIONAL_METRICS.km - AI_METRICS.km) / TRADITIONAL_METRICS.km) * 100)}%`,
                });
            }
        };

        animationRef.current = requestAnimationFrame(animate);
    }, [traditionalVehicle, aiVehicle, isSimulating, traditionalStatus, aiStatus]);

    const resetSimulation = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        setIsSimulating(false);
        setTraditionalProgress(0);
        setAiProgress(0);
        setTraditionalStatus('waiting');
        setAiStatus('waiting');
        setCurrentMetrics({
            traditional: { km: 0, time: 0, fuel: 0, stops: 0 },
            ai: { km: 0, time: 0, fuel: 0, stops: 0 },
        });
        setSavings({ km: '--', time: '--', fuel: '--', percent: '--' });

        if (traditionalVehicle) {
            traditionalVehicle.setLatLng([TRADITIONAL_ROUTE[0].lat, TRADITIONAL_ROUTE[0].lng]);
        }
        if (aiVehicle) {
            aiVehicle.setLatLng([AI_ROUTE[0].lat, AI_ROUTE[0].lng]);
        }
    }, [traditionalVehicle, aiVehicle]);

    if (isMobile) {
        return (
            <div className={`glass-strong rounded-2xl p-6 border border-primary/20 ${className}`}>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 mb-4">
                        <Zap className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">{t('about.simulation.badge')}</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{t('about.simulation.title')}</h3>
                    <p className="text-muted-foreground text-sm">{t('about.simulation.subtitle')}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="glass rounded-xl p-4 text-center border border-muted-foreground/20">
                        <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-lg font-bold text-muted-foreground">{t('about.simulation.traditional.title')}</div>
                        <div className="text-2xl font-black text-muted-foreground">72 km</div>
                        <div className="text-sm text-muted-foreground">~95 min</div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center border border-secondary/50">
                        <Brain className="w-8 h-8 mx-auto mb-2 text-secondary" />
                        <div className="text-lg font-bold text-secondary">PATHXPRESS</div>
                        <div className="text-2xl font-black text-secondary">41 km</div>
                        <div className="text-sm text-secondary">~48 min</div>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    <div className="glass rounded-lg p-3 text-center">
                        <Route className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">31</div>
                        <div className="text-[10px] text-muted-foreground">{t('about.simulation.metrics.km')}</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Clock className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">47</div>
                        <div className="text-[10px] text-muted-foreground">{t('about.simulation.metrics.time')}</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Fuel className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">6.2</div>
                        <div className="text-[10px] text-muted-foreground">{t('about.simulation.metrics.fuel')}</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Zap className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">43%</div>
                        <div className="text-[10px] text-muted-foreground">{t('about.simulation.results.moreEfficient')}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`${className}`}>
            {/* Section Header */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
                    <Brain className="w-4 h-4 text-secondary" />
                    <span className="text-sm font-medium text-secondary">{t('about.simulation.badge')}</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                    {t('about.simulation.title')}
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    {t('about.simulation.subtitle')}
                </p>
            </div>

            {/* Control Bar */}
            <div className="flex justify-center gap-4 mb-10 flex-wrap">
                <Button
                    onClick={startSimulation}
                    disabled={isSimulating || !mapsLoaded}
                    className="bg-secondary hover:bg-secondary/90 rounded-full px-8 py-6 text-base font-semibold shadow-lg shadow-secondary/25"
                >
                    <Play className="w-5 h-5 mr-2" />
                    {t('about.simulation.startSimulation')}
                </Button>
                <Button
                    onClick={resetSimulation}
                    variant="outline"
                    className="border-primary/50 text-primary hover:bg-primary/10 rounded-full px-8 py-6 text-base"
                >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    {t('about.simulation.reset')}
                </Button>
                <Button
                    onClick={toggleTraffic}
                    variant="outline"
                    className={`rounded-full px-8 py-6 text-base ${showTraffic ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'border-muted-foreground/50 hover:border-orange-400 hover:text-orange-400'}`}
                >
                    <TrafficCone className="w-5 h-5 mr-2" />
                    {showTraffic ? t('about.simulation.hideTraffic') : t('about.simulation.showTraffic')}
                </Button>
            </div>

            {/* Maps Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                {/* Traditional Map Card */}
                <div className="glass-strong rounded-3xl overflow-hidden border border-muted-foreground/20 card-hover-lift">
                    <div className="flex items-center justify-between p-5 bg-background/30 border-b border-border/50">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-muted-foreground/80 flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold">{t('about.simulation.traditional.title')}</span>
                        </div>
                        <span className="px-4 py-2 rounded-full bg-muted-foreground/20 text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                            {t('about.simulation.traditional.badge')}
                        </span>
                    </div>

                    <div className="relative h-[400px]">
                        <div ref={traditionalMapRef} className="w-full h-full" style={{ background: '#0f172a' }} />

                        <div className="absolute top-4 right-4 z-[1000] glass rounded-xl px-4 py-3 min-w-[160px]">
                            <div className="text-[10px] text-muted-foreground uppercase mb-2 tracking-wide">{t('about.simulation.metrics.progress')}</div>
                            <div className="h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-muted-foreground rounded-full transition-all duration-200"
                                    style={{ width: `${traditionalProgress}%` }}
                                />
                            </div>
                            <div className="text-right text-xs text-muted-foreground mt-1">{Math.round(traditionalProgress)}%</div>
                        </div>

                        <div className={`absolute bottom-4 left-4 z-[1000] glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm border ${traditionalStatus === 'running' ? 'border-green-500/50' : traditionalStatus === 'completed' ? 'border-muted-foreground' : 'border-transparent'
                            }`}>
                            {traditionalStatus === 'waiting' && <><Pause className="w-4 h-4 text-muted-foreground" /> {t('about.simulation.traditional.waiting')}</>}
                            {traditionalStatus === 'running' && <><Play className="w-4 h-4 text-green-500" /> {t('about.simulation.traditional.running')}</>}
                            {traditionalStatus === 'completed' && <><Check className="w-4 h-4 text-muted-foreground" /> {t('about.simulation.traditional.completed')}</>}
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 p-5 bg-background/20">
                        {[
                            { icon: Route, value: currentMetrics.traditional.km, label: t('about.simulation.metrics.km') },
                            { icon: Clock, value: currentMetrics.traditional.time, label: t('about.simulation.metrics.time') },
                            { icon: Fuel, value: currentMetrics.traditional.fuel, label: t('about.simulation.metrics.fuel') },
                            { icon: Package, value: `${currentMetrics.traditional.stops}/10`, label: t('about.simulation.metrics.deliveries') },
                        ].map((metric, i) => (
                            <div key={i} className="text-center p-4 glass rounded-xl">
                                <metric.icon className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                                <div className="text-2xl font-bold text-muted-foreground">{metric.value}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{metric.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 p-4 overflow-x-auto border-t border-border/30">
                        {[
                            t('about.simulation.features.noTraffic'),
                            t('about.simulation.features.distanceOnly'),
                            t('about.simulation.features.fixedRoute')
                        ].map((tag, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-muted-foreground/10 text-muted-foreground text-xs whitespace-nowrap">
                                <X className="w-3 h-3" /> {tag}
                            </span>
                        ))}
                    </div>
                </div>

                {/* AI Map Card */}
                <div className="glass-strong rounded-3xl overflow-hidden border-2 border-secondary card-hover-lift" style={{ boxShadow: '0 20px 60px rgba(229, 57, 53, 0.2)' }}>
                    <div className="flex items-center justify-between p-5 bg-background/30 border-b border-secondary/30">
                        <div className="flex items-center gap-3">
                            <img
                                src="/pathxpress-logo.png"
                                alt="PATHXPRESS"
                                className="h-10 w-auto"
                            />
                            <span className="text-xl font-bold">{t('about.simulation.ai.title')}</span>
                        </div>
                        <span className="px-4 py-2 rounded-full bg-secondary/20 text-secondary text-xs font-semibold uppercase tracking-wide">
                            {t('about.simulation.ai.badge')}
                        </span>
                    </div>

                    <div className="relative h-[400px]">
                        <div ref={aiMapRef} className="w-full h-full" style={{ background: '#0f172a' }} />

                        <div className="absolute top-4 right-4 z-[1000] glass rounded-xl px-4 py-3 min-w-[160px] border border-secondary/30">
                            <div className="text-[10px] text-secondary uppercase mb-2 tracking-wide">{t('about.simulation.metrics.progress')}</div>
                            <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-secondary rounded-full transition-all duration-200"
                                    style={{ width: `${aiProgress}%` }}
                                />
                            </div>
                            <div className="text-right text-xs text-secondary mt-1">{Math.round(aiProgress)}%</div>
                        </div>

                        <div className={`absolute bottom-4 left-4 z-[1000] glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm border ${aiStatus === 'running' ? 'border-green-500/50' : aiStatus === 'completed' ? 'border-secondary bg-secondary/10' : 'border-transparent'
                            }`}>
                            {aiStatus === 'waiting' && <><Pause className="w-4 h-4 text-muted-foreground" /> {t('about.simulation.ai.waiting')}</>}
                            {aiStatus === 'running' && <><Play className="w-4 h-4 text-green-500" /> {t('about.simulation.ai.running')}</>}
                            {aiStatus === 'completed' && <><Check className="w-4 h-4 text-secondary" /> {t('about.simulation.ai.completed')}</>}
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 p-5 bg-background/20">
                        {[
                            { icon: Route, value: currentMetrics.ai.km, label: t('about.simulation.metrics.km') },
                            { icon: Clock, value: currentMetrics.ai.time, label: t('about.simulation.metrics.time') },
                            { icon: Fuel, value: currentMetrics.ai.fuel, label: t('about.simulation.metrics.fuel') },
                            { icon: Package, value: `${currentMetrics.ai.stops}/10`, label: t('about.simulation.metrics.deliveries') },
                        ].map((metric, i) => (
                            <div key={i} className="text-center p-4 glass rounded-xl border border-secondary/20">
                                <metric.icon className="w-5 h-5 mx-auto mb-2 text-secondary" />
                                <div className="text-2xl font-bold text-secondary">{metric.value}</div>
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{metric.label}</div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-2 p-4 overflow-x-auto border-t border-secondary/20">
                        {[
                            t('about.simulation.features.realTimeTraffic'),
                            t('about.simulation.features.timeDistance'),
                            t('about.simulation.features.reOptimization')
                        ].map((tag, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/15 text-secondary text-xs whitespace-nowrap">
                                <Check className="w-3 h-3" /> {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Savings Banner */}
            <div className="glass-strong border-2 border-secondary/50 rounded-3xl p-10 text-center" style={{ background: 'linear-gradient(135deg, rgba(229, 57, 53, 0.08), rgba(15, 23, 42, 0.95))' }}>
                <h2 className="text-xl md:text-2xl font-bold mb-8 flex items-center justify-center gap-3">
                    <Zap className="w-7 h-7 text-secondary" />
                    <span>{t('about.simulation.results.title')}</span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                        { value: savings.km, label: t('about.simulation.results.kmSaved') },
                        { value: savings.time, label: t('about.simulation.results.timeSaved') },
                        { value: savings.fuel, label: t('about.simulation.results.fuelSaved') },
                        { value: savings.percent, label: t('about.simulation.results.moreEfficient') },
                    ].map((item, i) => (
                        <div key={i} className="text-center">
                            <div className="text-4xl md:text-5xl font-black text-secondary">{item.value}</div>
                            <div className="text-muted-foreground mt-2">{item.label}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
