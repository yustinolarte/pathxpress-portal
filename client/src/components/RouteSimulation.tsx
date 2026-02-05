import { useEffect, useRef, useState } from 'react';
import { Play, RotateCcw, Car, Zap, Clock, Fuel, MapPin, TrafficCone } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Declare L as global (loaded from CDN)
declare const L: any;

// Dubai coordinates and waypoints from demo
const DUBAI_CENTER = { lat: 25.2048, lng: 55.2708 };

const TRADITIONAL_ROUTE = [
    { lat: 25.2048, lng: 55.2708 }, // Downtown Dubai
    { lat: 25.1972, lng: 55.2744 },
    { lat: 25.1895, lng: 55.2681 },
    { lat: 25.1821, lng: 55.2548 }, // Business Bay
    { lat: 25.1756, lng: 55.2423 },
    { lat: 25.1689, lng: 55.2301 },
    { lat: 25.1612, lng: 55.2189 }, // DIFC area
    { lat: 25.1534, lng: 55.2078 },
    { lat: 25.1445, lng: 55.1956 },
    { lat: 25.1367, lng: 55.1834 }, // Jumeirah
    { lat: 25.1289, lng: 55.1712 },
    { lat: 25.1198, lng: 55.1589 },
    { lat: 25.1123, lng: 55.1456 }, // Al Quoz
    { lat: 25.0987, lng: 55.1334 },
    { lat: 25.0856, lng: 55.1201 },
    { lat: 25.0734, lng: 55.1089 }, // Dubai Marina
];

const AI_ROUTE = [
    { lat: 25.2048, lng: 55.2708 }, // Downtown Dubai
    { lat: 25.1956, lng: 55.2612 },
    { lat: 25.1834, lng: 55.2489 }, // Optimized path
    { lat: 25.1712, lng: 55.2356 },
    { lat: 25.1589, lng: 55.2223 },
    { lat: 25.1456, lng: 55.2078 }, // Avoiding traffic
    { lat: 25.1312, lng: 55.1923 },
    { lat: 25.1167, lng: 55.1767 },
    { lat: 25.1023, lng: 55.1523 }, // Direct AI route
    { lat: 25.0878, lng: 55.1267 },
    { lat: 25.0734, lng: 55.1089 }, // Dubai Marina
];

const DELIVERY_POINTS = [
    { lat: 25.1821, lng: 55.2548, name: 'Business Bay Tower' },
    { lat: 25.1612, lng: 55.2189, name: 'DIFC Gate' },
    { lat: 25.1367, lng: 55.1834, name: 'Jumeirah Beach' },
    { lat: 25.1123, lng: 55.1456, name: 'Al Quoz Warehouse' },
    { lat: 25.0734, lng: 55.1089, name: 'Marina Walk' },
];

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
    const [traditionalMarker, setTraditionalMarker] = useState<any>(null);
    const [aiMarker, setAiMarker] = useState<any>(null);
    const [traditionalProgress, setTraditionalProgress] = useState(0);
    const [aiProgress, setAiProgress] = useState(0);
    const animationRef = useRef<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [mapsLoaded, setMapsLoaded] = useState(false);

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

        // Traditional route map
        const tMap = L.map(traditionalMapRef.current, {
            center: [25.14, 55.19],
            zoom: 12,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(tMap);

        // AI route map
        const aMap = L.map(aiMapRef.current, {
            center: [25.14, 55.19],
            zoom: 12,
            zoomControl: false,
            attributionControl: false,
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 19,
        }).addTo(aMap);

        // Draw routes
        const traditionalLatLngs = TRADITIONAL_ROUTE.map(p => [p.lat, p.lng]);
        const aiLatLngs = AI_ROUTE.map(p => [p.lat, p.lng]);

        L.polyline(traditionalLatLngs, { color: '#64748b', weight: 4, opacity: 0.8 }).addTo(tMap);
        L.polyline(aiLatLngs, { color: '#e53935', weight: 4, opacity: 0.8 }).addTo(aMap);

        // Add delivery markers
        DELIVERY_POINTS.forEach((point, i) => {
            const markerIcon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: #e53935; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white;">${i + 1}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            });

            L.marker([point.lat, point.lng], { icon: markerIcon }).addTo(tMap);
            L.marker([point.lat, point.lng], { icon: markerIcon }).addTo(aMap);
        });

        // Create vehicle markers
        const vehicleIcon = L.divIcon({
            className: 'vehicle-marker',
            html: `<div style="background: #1e293b; padding: 4px 8px; border-radius: 8px; border: 2px solid #e53935;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path><path d="M15 18H9"></path><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path><circle cx="17" cy="18" r="2"></circle><circle cx="7" cy="18" r="2"></circle></svg></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
        });

        const tMarker = L.marker([TRADITIONAL_ROUTE[0].lat, TRADITIONAL_ROUTE[0].lng], { icon: vehicleIcon }).addTo(tMap);
        const aMarker = L.marker([AI_ROUTE[0].lat, AI_ROUTE[0].lng], { icon: vehicleIcon }).addTo(aMap);

        setTraditionalMap(tMap);
        setAiMap(aMap);
        setTraditionalMarker(tMarker);
        setAiMarker(aMarker);
        setMapsLoaded(true);

        return () => {
            tMap.remove();
            aMap.remove();
        };
    }, [isMobile]);

    // Simulation animation
    const startSimulation = () => {
        if (!traditionalMarker || !aiMarker || isSimulating) return;

        setIsSimulating(true);
        setTraditionalProgress(0);
        setAiProgress(0);

        let tStep = 0;
        let aStep = 0;
        const tTotal = TRADITIONAL_ROUTE.length - 1;
        const aTotal = AI_ROUTE.length - 1;

        const animate = () => {
            // Traditional route (slower)
            if (tStep < tTotal) {
                tStep += 0.015; // Slower
                const idx = Math.min(Math.floor(tStep), tTotal - 1);
                const nextIdx = Math.min(idx + 1, tTotal);
                const frac = tStep - idx;

                const lat = TRADITIONAL_ROUTE[idx].lat + (TRADITIONAL_ROUTE[nextIdx].lat - TRADITIONAL_ROUTE[idx].lat) * frac;
                const lng = TRADITIONAL_ROUTE[idx].lng + (TRADITIONAL_ROUTE[nextIdx].lng - TRADITIONAL_ROUTE[idx].lng) * frac;

                traditionalMarker.setLatLng([lat, lng]);
                setTraditionalProgress((tStep / tTotal) * 100);
            }

            // AI route (faster)
            if (aStep < aTotal) {
                aStep += 0.025; // Faster
                const idx = Math.min(Math.floor(aStep), aTotal - 1);
                const nextIdx = Math.min(idx + 1, aTotal);
                const frac = aStep - idx;

                const lat = AI_ROUTE[idx].lat + (AI_ROUTE[nextIdx].lat - AI_ROUTE[idx].lat) * frac;
                const lng = AI_ROUTE[idx].lng + (AI_ROUTE[nextIdx].lng - AI_ROUTE[idx].lng) * frac;

                aiMarker.setLatLng([lat, lng]);
                setAiProgress((aStep / aTotal) * 100);
            }

            if (tStep < tTotal || aStep < aTotal) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setIsSimulating(false);
                setTraditionalProgress(100);
                setAiProgress(100);
            }
        };

        animationRef.current = requestAnimationFrame(animate);
    };

    const resetSimulation = () => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        setIsSimulating(false);
        setTraditionalProgress(0);
        setAiProgress(0);

        if (traditionalMarker) {
            traditionalMarker.setLatLng([TRADITIONAL_ROUTE[0].lat, TRADITIONAL_ROUTE[0].lng]);
        }
        if (aiMarker) {
            aiMarker.setLatLng([AI_ROUTE[0].lat, AI_ROUTE[0].lng]);
        }
    };

    // Mobile fallback - show static preview
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
                        <Car className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <div className="text-lg font-bold text-muted-foreground">Tradicional</div>
                        <div className="text-2xl font-black text-muted-foreground">47 km</div>
                        <div className="text-sm text-muted-foreground">~52 min</div>
                    </div>
                    <div className="glass rounded-xl p-4 text-center border border-secondary/50">
                        <Zap className="w-8 h-8 mx-auto mb-2 text-secondary" />
                        <div className="text-lg font-bold text-secondary">PATHXPRESS</div>
                        <div className="text-2xl font-black text-secondary">28 km</div>
                        <div className="text-sm text-secondary">~19 min</div>
                    </div>
                </div>

                {/* Savings */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="glass rounded-lg p-3 text-center">
                        <MapPin className="w-5 h-5 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">-19 km</div>
                        <div className="text-xs text-muted-foreground">Distancia</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Clock className="w-5 h-5 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">-33 min</div>
                        <div className="text-xs text-muted-foreground">Tiempo</div>
                    </div>
                    <div className="glass rounded-lg p-3 text-center">
                        <Fuel className="w-5 h-5 mx-auto mb-1 text-secondary" />
                        <div className="text-lg font-bold text-secondary">-3.7 L</div>
                        <div className="text-xs text-muted-foreground">Combustible</div>
                    </div>
                </div>

                <p className="text-center text-xs text-muted-foreground mt-4">
                    Ve la simulación completa en desktop
                </p>
            </div>
        );
    }

    return (
        <div className={`glass-strong rounded-2xl overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-6 border-b border-border">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/20 mb-2">
                            <Zap className="w-4 h-4 text-secondary" />
                            <span className="text-sm font-medium text-secondary">Simulación en Vivo</span>
                        </div>
                        <h3 className="text-2xl font-bold">Comparación de Rutas en Dubai</h3>
                        <p className="text-muted-foreground text-sm">
                            5 entregas: Downtown → Business Bay → DIFC → Jumeirah → Al Quoz → Marina
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={startSimulation}
                            disabled={isSimulating || !mapsLoaded}
                            className="bg-secondary hover:bg-secondary/90"
                        >
                            <Play className="w-4 h-4 mr-2" />
                            Iniciar Simulación
                        </Button>
                        <Button
                            onClick={resetSimulation}
                            variant="outline"
                            className="border-secondary text-secondary hover:bg-secondary/10"
                        >
                            <RotateCcw className="w-4 h-4 mr-2" />
                            Reiniciar
                        </Button>
                        <Button
                            onClick={() => setShowTraffic(!showTraffic)}
                            variant="outline"
                            className={showTraffic ? 'bg-orange-500/20 border-orange-500 text-orange-400' : ''}
                        >
                            <TrafficCone className="w-4 h-4 mr-2" />
                            {showTraffic ? 'Ocultar' : 'Mostrar'} Tráfico
                        </Button>
                    </div>
                </div>
            </div>

            {/* Maps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {/* Traditional Map */}
                <div className="relative">
                    <div className="absolute top-4 left-4 z-[1000] glass rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                            <Car className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-semibold text-muted-foreground">Ruta Tradicional</span>
                        </div>
                    </div>
                    <div
                        ref={traditionalMapRef}
                        className="h-[400px] w-full"
                        style={{ background: '#1e293b' }}
                    />
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/20">
                        <div
                            className="h-full bg-muted-foreground transition-all duration-100"
                            style={{ width: `${traditionalProgress}%` }}
                        />
                    </div>
                </div>

                {/* AI Map */}
                <div className="relative border-l border-border">
                    <div className="absolute top-4 left-4 z-[1000] glass rounded-lg px-3 py-2 border border-secondary/50">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-secondary" />
                            <span className="text-sm font-semibold text-secondary">PATHXPRESS IA</span>
                        </div>
                    </div>
                    {aiProgress >= 100 && traditionalProgress < 100 && (
                        <div className="absolute top-4 right-4 z-[1000] bg-secondary text-white rounded-lg px-3 py-2 animate-pulse">
                            <span className="text-sm font-bold">¡LLEGÓ PRIMERO!</span>
                        </div>
                    )}
                    <div
                        ref={aiMapRef}
                        className="h-[400px] w-full"
                        style={{ background: '#1e293b' }}
                    />
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary/20">
                        <div
                            className="h-full bg-secondary transition-all duration-100"
                            style={{ width: `${aiProgress}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Stats comparison */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-background/50">
                <div className="text-center">
                    <div className="text-muted-foreground text-sm mb-1">Distancia Tradicional</div>
                    <div className="text-2xl font-bold text-muted-foreground">47 km</div>
                </div>
                <div className="text-center">
                    <div className="text-secondary text-sm mb-1">Distancia IA</div>
                    <div className="text-2xl font-bold text-secondary">28 km</div>
                </div>
                <div className="text-center">
                    <div className="text-muted-foreground text-sm mb-1">Tiempo Tradicional</div>
                    <div className="text-2xl font-bold text-muted-foreground">52 min</div>
                </div>
                <div className="text-center">
                    <div className="text-secondary text-sm mb-1">Tiempo IA</div>
                    <div className="text-2xl font-bold text-secondary">19 min</div>
                </div>
            </div>
        </div>
    );
}
