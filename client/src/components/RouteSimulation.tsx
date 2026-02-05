import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Car, Zap, Clock, Fuel, MapPin, TrafficCone, Package, Route, Brain, Pause, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Declare L as global (loaded from CDN)
declare const L: any;

// Dubai delivery route coordinates - 6 stops
const WAREHOUSE = { lat: 25.2048, lng: 55.2708, name: 'Almacén Central - Downtown Dubai' };

const DELIVERY_STOPS = [
    { lat: 25.1972, lng: 55.2744, name: 'Business Bay Tower' },
    { lat: 25.1612, lng: 55.2189, name: 'DIFC Gate' },
    { lat: 25.1367, lng: 55.1834, name: 'Jumeirah Beach Residence' },
    { lat: 25.1123, lng: 55.1456, name: 'Al Quoz Industrial' },
    { lat: 25.0856, lng: 55.1201, name: 'Dubai Marina Mall' },
    { lat: 25.0734, lng: 55.1089, name: 'JBR Walk' },
];

// Traditional route - simple straight-line approach (longer)
const TRADITIONAL_ROUTE = [
    WAREHOUSE,
    { lat: 25.1972, lng: 55.2744 },
    { lat: 25.1895, lng: 55.2681 },
    { lat: 25.1821, lng: 55.2548 },
    { lat: 25.1756, lng: 55.2423 },
    { lat: 25.1689, lng: 55.2301 },
    { lat: 25.1612, lng: 55.2189 },
    { lat: 25.1534, lng: 55.2078 },
    { lat: 25.1445, lng: 55.1956 },
    { lat: 25.1367, lng: 55.1834 },
    { lat: 25.1289, lng: 55.1712 },
    { lat: 25.1198, lng: 55.1589 },
    { lat: 25.1123, lng: 55.1456 },
    { lat: 25.0987, lng: 55.1334 },
    { lat: 25.0856, lng: 55.1201 },
    { lat: 25.0734, lng: 55.1089 },
];

// AI optimized route - smarter clustering (shorter)
const AI_ROUTE = [
    WAREHOUSE,
    { lat: 25.1956, lng: 55.2612 },
    { lat: 25.1834, lng: 55.2489 },
    { lat: 25.1712, lng: 55.2356 },
    { lat: 25.1589, lng: 55.2223 },
    { lat: 25.1456, lng: 55.2078 },
    { lat: 25.1312, lng: 55.1923 },
    { lat: 25.1167, lng: 55.1767 },
    { lat: 25.1023, lng: 55.1523 },
    { lat: 25.0878, lng: 55.1267 },
    { lat: 25.0734, lng: 55.1089 },
];

// Final metrics
const TRADITIONAL_METRICS = { km: 47, time: 52, fuel: 9.4, stops: 6 };
const AI_METRICS = { km: 28, time: 19, fuel: 5.7, stops: 6 };

interface RouteSimulationProps {
    className?: string;
}

export default function RouteSimulation({ className = '' }: RouteSimulationProps) {
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

    // Check if mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Initialize maps
    useEffect(() => {
        if (isMobile || !traditionalMapRef.current || !aiMapRef.current || typeof L === 'undefined') return;

        const mapCenter: [number, number] = [25.14, 55.19];
        const mapZoom = 12;

        // Traditional route map
        const tMap = L.map(traditionalMapRef.current, {
            center: mapCenter,
            zoom: mapZoom,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(tMap);

        // AI route map
        const aMap = L.map(aiMapRef.current, {
            center: mapCenter,
            zoom: mapZoom,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(aMap);

        // Draw routes
        const traditionalLatLngs = TRADITIONAL_ROUTE.map(p => [p.lat, p.lng]);
        const aiLatLngs = AI_ROUTE.map(p => [p.lat, p.lng]);

        L.polyline(traditionalLatLngs, { color: '#64748b', weight: 5, opacity: 0.8 }).addTo(tMap);
        L.polyline(aiLatLngs, { color: '#e53935', weight: 5, opacity: 0.8 }).addTo(aMap);

        // Add warehouse marker
        const warehouseIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: #e53935; color: white; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; border: 3px solid white; box-shadow: 0 3px 15px rgba(0,0,0,0.4);">🏭</div>`,
            iconSize: [42, 42],
            iconAnchor: [21, 21],
        });

        L.marker([WAREHOUSE.lat, WAREHOUSE.lng], { icon: warehouseIcon }).addTo(tMap);
        L.marker([WAREHOUSE.lat, WAREHOUSE.lng], { icon: warehouseIcon }).addTo(aMap);

        // Add delivery stop markers
        DELIVERY_STOPS.forEach((stop, i) => {
            const traditionalMarkerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #64748b; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 3px solid white; box-shadow: 0 3px 15px rgba(0,0,0,0.4);">${i + 1}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            const aiMarkerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #e53935; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 3px solid white; box-shadow: 0 3px 15px rgba(0,0,0,0.4);">${i + 1}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16],
            });

            L.marker([stop.lat, stop.lng], { icon: traditionalMarkerIcon }).addTo(tMap);
            L.marker([stop.lat, stop.lng], { icon: aiMarkerIcon }).addTo(aMap);
        });

        // Create vehicle markers
        const createVehicleIcon = (color: string) => L.divIcon({
            className: 'vehicle-marker',
            html: `<div style="font-size: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🚐</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
        });

        const tVehicle = L.marker([TRADITIONAL_ROUTE[0].lat, TRADITIONAL_ROUTE[0].lng], {
            icon: createVehicleIcon('#64748b'),
            zIndexOffset: 1000,
        }).addTo(tMap);

        const aVehicle = L.marker([AI_ROUTE[0].lat, AI_ROUTE[0].lng], {
            icon: createVehicleIcon('#e53935'),
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

    // Toggle traffic visualization
    const toggleTraffic = useCallback(() => {
        if (!traditionalMap || !aiMap) return;

        setShowTraffic(prev => {
            const newValue = !prev;

            if (newValue) {
                // Add traffic zones (simulated congestion areas)
                const trafficZones = [
                    { lat: 25.18, lng: 55.25, radius: 800 },
                    { lat: 25.15, lng: 55.20, radius: 600 },
                    { lat: 25.12, lng: 55.17, radius: 500 },
                ];

                trafficZones.forEach(zone => {
                    const circle1 = L.circle([zone.lat, zone.lng], {
                        radius: zone.radius,
                        color: '#ff6b6b',
                        fillColor: '#ff6b6b',
                        fillOpacity: 0.3,
                        weight: 2,
                    }).addTo(traditionalMap);

                    const circle2 = L.circle([zone.lat, zone.lng], {
                        radius: zone.radius,
                        color: '#ff6b6b',
                        fillColor: '#ff6b6b',
                        fillOpacity: 0.3,
                        weight: 2,
                    }).addTo(aiMap);

                    trafficLayersRef.current.push(circle1, circle2);
                });
            } else {
                // Remove traffic layers
                trafficLayersRef.current.forEach(layer => {
                    traditionalMap.removeLayer(layer);
                    aiMap.removeLayer(layer);
                });
                trafficLayersRef.current = [];
            }

            return newValue;
        });
    }, [traditionalMap, aiMap]);

    // Interpolate position along route
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

    // Start simulation
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
        const tSpeed = 0.003; // Traditional is slower
        const aSpeed = 0.006; // AI is faster

        const animate = () => {
            // Update traditional progress
            if (tProgress < 1) {
                tProgress = Math.min(tProgress + tSpeed, 1);
                setTraditionalProgress(tProgress * 100);

                const pos = getPositionAtProgress(TRADITIONAL_ROUTE, tProgress);
                traditionalVehicle.setLatLng([pos.lat, pos.lng]);

                // Update metrics
                setCurrentMetrics(prev => ({
                    ...prev,
                    traditional: {
                        km: Math.round(TRADITIONAL_METRICS.km * tProgress),
                        time: Math.round(TRADITIONAL_METRICS.time * tProgress),
                        fuel: +(TRADITIONAL_METRICS.fuel * tProgress).toFixed(1),
                        stops: Math.min(Math.floor(tProgress * 6) + 1, 6),
                    },
                }));
            } else if (traditionalStatus !== 'completed') {
                setTraditionalStatus('completed');
                setCurrentMetrics(prev => ({
                    ...prev,
                    traditional: TRADITIONAL_METRICS,
                }));
            }

            // Update AI progress
            if (aProgress < 1) {
                aProgress = Math.min(aProgress + aSpeed, 1);
                setAiProgress(aProgress * 100);

                const pos = getPositionAtProgress(AI_ROUTE, aProgress);
                aiVehicle.setLatLng([pos.lat, pos.lng]);

                // Update metrics
                setCurrentMetrics(prev => ({
                    ...prev,
                    ai: {
                        km: Math.round(AI_METRICS.km * aProgress),
                        time: Math.round(AI_METRICS.time * aProgress),
                        fuel: +(AI_METRICS.fuel * aProgress).toFixed(1),
                        stops: Math.min(Math.floor(aProgress * 6) + 1, 6),
                    },
                }));
            } else if (aiStatus !== 'completed') {
                setAiStatus('completed');
                setCurrentMetrics(prev => ({
                    ...prev,
                    ai: AI_METRICS,
                }));
            }

            // Continue animation or finish
            if (tProgress < 1 || aProgress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setIsSimulating(false);
                // Calculate savings
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

    // Reset simulation
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

    // Mobile fallback
    if (isMobile) {
        return (
            <div className={`glass-strong rounded-2xl p-6 ${className}`}>
                <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/20 mb-4">
                        <Zap className="w-4 h-4 text-secondary" />
                        <span className="text-sm font-medium text-secondary">Simulación de Rutas</span>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Optimización con IA en Acción</h3>
                    <p className="text-muted-foreground text-sm">
                        Nuestra IA analiza tráfico en tiempo real para encontrar la ruta más eficiente
                    </p>
                </div>

                {/* Static comparison */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="glass rounded-xl p-4 text-center border border-muted-foreground/30">
                        <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-lg font-bold text-muted-foreground">Tradicional</div>
                        <div className="text-2xl font-black text-muted-foreground">47 km</div>
                        <div className="text-sm text-muted-foreground">~52 min</div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center border border-secondary/50">
                        <Brain className="w-8 h-8 mx-auto mb-2 text-secondary" />
                        <div className="text-lg font-bold text-secondary">PATHXPRESS</div>
                        <div className="text-2xl font-black text-secondary">28 km</div>
                        <div className="text-sm text-secondary">~19 min</div>
                    </div>
                </div>

                {/* Savings */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="glass rounded-lg p-3 text-center">
                        <Route className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">19</div>
                        <div className="text-[10px] text-muted-foreground">Km</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Clock className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">33</div>
                        <div className="text-[10px] text-muted-foreground">Min</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Fuel className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">3.7</div>
                        <div className="text-[10px] text-muted-foreground">Litros</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Zap className="w-4 h-4 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">40%</div>
                        <div className="text-[10px] text-muted-foreground">Mejor</div>
                    </div>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-4">
                    Ve la simulación interactiva en desktop
                </p>
            </div>
        );
    }

    return (
        <div className={`${className}`}>
            {/* Control Bar */}
            <div className="flex justify-center gap-4 mb-8 flex-wrap">
                <Button
                    onClick={startSimulation}
                    disabled={isSimulating || !mapsLoaded}
                    className="bg-secondary hover:bg-secondary/90 rounded-full px-8 py-6 text-base font-semibold"
                >
                    <Play className="w-5 h-5 mr-2" />
                    Iniciar Simulación
                </Button>
                <Button
                    onClick={resetSimulation}
                    variant="outline"
                    className="border-muted-foreground/50 rounded-full px-8 py-6 text-base"
                >
                    <RotateCcw className="w-5 h-5 mr-2" />
                    Reiniciar
                </Button>
                <Button
                    onClick={toggleTraffic}
                    variant="outline"
                    className={`rounded-full px-8 py-6 text-base ${showTraffic ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'border-muted-foreground/50'}`}
                >
                    <TrafficCone className="w-5 h-5 mr-2" />
                    {showTraffic ? 'Ocultar' : 'Mostrar'} Tráfico
                </Button>
            </div>

            {/* Maps Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
                {/* Traditional Map Card */}
                <div className="glass-strong rounded-3xl overflow-hidden border border-muted-foreground/20">
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 bg-background/30">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-muted-foreground flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold">Ruta Tradicional</span>
                        </div>
                        <span className="px-4 py-2 rounded-full bg-white/10 text-muted-foreground text-xs font-semibold uppercase">
                            Distancia Mínima
                        </span>
                    </div>

                    {/* Map */}
                    <div className="relative h-[380px]">
                        <div ref={traditionalMapRef} className="w-full h-full" style={{ background: '#0f172a' }} />

                        {/* Progress overlay */}
                        <div className="absolute top-4 right-4 z-[1000] bg-black/85 px-4 py-3 rounded-xl min-w-[160px]">
                            <div className="text-[10px] text-muted-foreground uppercase mb-2">Progreso</div>
                            <div className="h-2 bg-white/10 rounded overflow-hidden">
                                <div
                                    className="h-full bg-muted-foreground rounded transition-all duration-200"
                                    style={{ width: `${traditionalProgress}%` }}
                                />
                            </div>
                        </div>

                        {/* Status overlay */}
                        <div className={`absolute bottom-4 left-4 z-[1000] bg-black/85 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm border ${traditionalStatus === 'running' ? 'border-green-500' : traditionalStatus === 'completed' ? 'border-secondary bg-secondary/15' : 'border-transparent'
                            }`}>
                            {traditionalStatus === 'waiting' && <><Pause className="w-4 h-4" /> Esperando inicio...</>}
                            {traditionalStatus === 'running' && <><Play className="w-4 h-4 text-green-500" /> En ruta...</>}
                            {traditionalStatus === 'completed' && <><Check className="w-4 h-4 text-secondary" /> Completado</>}
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-4 gap-2 p-5 bg-black/15">
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Route className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                            <div className="text-2xl font-bold text-muted-foreground">{currentMetrics.traditional.km}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Kilómetros</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Clock className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                            <div className="text-2xl font-bold text-muted-foreground">{currentMetrics.traditional.time}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Minutos</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Fuel className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                            <div className="text-2xl font-bold text-muted-foreground">{currentMetrics.traditional.fuel}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Litros</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Package className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                            <div className="text-2xl font-bold text-muted-foreground">{currentMetrics.traditional.stops}/6</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Entregas</div>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="flex gap-2 p-4 overflow-x-auto">
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 text-muted-foreground text-xs whitespace-nowrap">
                            <X className="w-3 h-3" /> Sin análisis de tráfico
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 text-muted-foreground text-xs whitespace-nowrap">
                            <X className="w-3 h-3" /> Solo distancia
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 text-muted-foreground text-xs whitespace-nowrap">
                            <X className="w-3 h-3" /> Ruta fija
                        </span>
                    </div>
                </div>

                {/* AI Map Card */}
                <div className="glass-strong rounded-3xl overflow-hidden border-2 border-secondary" style={{ boxShadow: '0 20px 50px rgba(229, 57, 53, 0.15)' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 bg-background/30">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                                <Brain className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold">PATH<span className="text-secondary">X</span>PRESS IA</span>
                        </div>
                        <span className="px-4 py-2 rounded-full bg-secondary/20 text-secondary text-xs font-semibold uppercase">
                            Multi-Objetivo
                        </span>
                    </div>

                    {/* Map */}
                    <div className="relative h-[380px]">
                        <div ref={aiMapRef} className="w-full h-full" style={{ background: '#0f172a' }} />

                        {/* Progress overlay */}
                        <div className="absolute top-4 right-4 z-[1000] bg-black/85 px-4 py-3 rounded-xl min-w-[160px]">
                            <div className="text-[10px] text-muted-foreground uppercase mb-2">Progreso</div>
                            <div className="h-2 bg-secondary/20 rounded overflow-hidden">
                                <div
                                    className="h-full bg-secondary rounded transition-all duration-200"
                                    style={{ width: `${aiProgress}%` }}
                                />
                            </div>
                        </div>

                        {/* Status overlay */}
                        <div className={`absolute bottom-4 left-4 z-[1000] bg-black/85 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm border ${aiStatus === 'running' ? 'border-green-500' : aiStatus === 'completed' ? 'border-secondary bg-secondary/15' : 'border-transparent'
                            }`}>
                            {aiStatus === 'waiting' && <><Pause className="w-4 h-4" /> Esperando inicio...</>}
                            {aiStatus === 'running' && <><Play className="w-4 h-4 text-green-500" /> En ruta...</>}
                            {aiStatus === 'completed' && <><Check className="w-4 h-4 text-secondary" /> ¡Completado primero!</>}
                        </div>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-4 gap-2 p-5 bg-black/15">
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Route className="w-5 h-5 mx-auto mb-2 text-secondary" />
                            <div className="text-2xl font-bold text-secondary">{currentMetrics.ai.km}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Kilómetros</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Clock className="w-5 h-5 mx-auto mb-2 text-secondary" />
                            <div className="text-2xl font-bold text-secondary">{currentMetrics.ai.time}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Minutos</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Fuel className="w-5 h-5 mx-auto mb-2 text-secondary" />
                            <div className="text-2xl font-bold text-secondary">{currentMetrics.ai.fuel}</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Litros</div>
                        </div>
                        <div className="text-center p-4 bg-white/5 rounded-xl">
                            <Package className="w-5 h-5 mx-auto mb-2 text-secondary" />
                            <div className="text-2xl font-bold text-secondary">{currentMetrics.ai.stops}/6</div>
                            <div className="text-[10px] text-muted-foreground uppercase">Entregas</div>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="flex gap-2 p-4 overflow-x-auto">
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/15 text-secondary/80 text-xs whitespace-nowrap">
                            <Check className="w-3 h-3" /> Tráfico en tiempo real
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/15 text-secondary/80 text-xs whitespace-nowrap">
                            <Check className="w-3 h-3" /> Tiempo + Distancia
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary/15 text-secondary/80 text-xs whitespace-nowrap">
                            <Check className="w-3 h-3" /> Re-optimización
                        </span>
                    </div>
                </div>
            </div>

            {/* Savings Banner */}
            <div className="glass-strong border-2 border-secondary rounded-3xl p-10 text-center mb-12" style={{ background: 'linear-gradient(135deg, rgba(229, 57, 53, 0.1), rgba(15, 23, 42, 0.9))' }}>
                <h2 className="text-xl md:text-2xl font-bold mb-8 flex items-center justify-center gap-3">
                    <Zap className="w-7 h-7 text-secondary" />
                    <span>Resultados de la <span className="text-secondary">Optimización con IA</span></span>
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                        <div className="text-4xl md:text-5xl font-black text-secondary">{savings.km}</div>
                        <div className="text-muted-foreground mt-1">Km Ahorrados</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl md:text-5xl font-black text-secondary">{savings.time}</div>
                        <div className="text-muted-foreground mt-1">Min Ahorrados</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl md:text-5xl font-black text-secondary">{savings.fuel}</div>
                        <div className="text-muted-foreground mt-1">Litros Ahorrados</div>
                    </div>
                    <div className="text-center">
                        <div className="text-4xl md:text-5xl font-black text-secondary">{savings.percent}</div>
                        <div className="text-muted-foreground mt-1">Más Eficiente</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
