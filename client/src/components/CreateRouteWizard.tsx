import { useState, useEffect, useMemo } from 'react';
import { customAlphabet } from 'nanoid';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { HIDDEN_BY_DEFAULT_STATUSES } from '@/lib/orderFilters';
import {
  Check, MapPin, Truck, Package, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, Hash, Calendar,
  FileText, QrCode, RefreshCw,
} from 'lucide-react';
import OrderPickList from './OrderPickList';

// Random, non-sequential route IDs (server re-checks uniqueness). Unambiguous alphabet (no I/O/0/1).
const genRouteSuffix = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const makeRouteId = () => `DXB-${new Date().getFullYear()}-${genRouteSuffix()}`;

// Dubai zone presets
const ZONE_OPTIONS = [
  { value: 'downtown_dubai', label: 'Downtown Dubai' },
  { value: 'dubai_marina', label: 'Dubai Marina' },
  { value: 'jbr', label: 'JBR' },
  { value: 'business_bay', label: 'Business Bay' },
  { value: 'jumeirah', label: 'Jumeirah' },
  { value: 'deira', label: 'Deira' },
  { value: 'bur_dubai', label: 'Bur Dubai' },
  { value: 'al_quoz', label: 'Al Quoz' },
  { value: 'jlt', label: 'JLT' },
  { value: 'silicon_oasis', label: 'Silicon Oasis' },
  { value: 'sports_city', label: 'Sports City' },
  { value: 'motor_city', label: 'Motor City' },
  { value: 'international_city', label: 'International City' },
  { value: 'al_barsha', label: 'Al Barsha' },
  { value: 'mirdif', label: 'Mirdif' },
  { value: 'dubai_hills', label: 'Dubai Hills' },
  { value: 'palm_jumeirah', label: 'Palm Jumeirah' },
  { value: 'sharjah', label: 'Sharjah' },
  { value: 'ajman', label: 'Ajman' },
  { value: 'abu_dhabi', label: 'Abu Dhabi' },
  { value: 'al_ain', label: 'Al Ain' },
  { value: 'rak', label: 'Ras Al Khaimah' },
  { value: 'fujairah', label: 'Fujairah' },
  { value: 'uaq', label: 'Umm Al Quwain' },
  { value: '__custom__', label: 'Personalizado...' },
];

interface CreateRouteWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (routeId: string) => void;
  drivers: Array<{ id: number; fullName: string; vehicleNumber: string | null; status: string }>;
  preloadedOrders?: Array<{ id: number; mode: 'pickup_only' | 'delivery_only' | 'both' }>;
}

const defaultForm = {
  id: '',
  date: new Date().toISOString().split('T')[0],
  zone: '',
  zoneCustom: '',
  driverId: '',
  vehicleInfo: '',
  notes: '',
  startAddress: '',
  startLat: '',
  startLng: '',
};

const STEPS = [
  { id: 1, label: 'Ruta',      icon: MapPin       },
  { id: 2, label: 'Conductor', icon: Truck        },
  { id: 3, label: 'Paquetes',  icon: Package      },
  { id: 4, label: 'Resumen',   icon: CheckCircle2 },
];

// ─── Componentes auxiliares ────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {label}{required && ' *'}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function CreateRouteWizard({ open, onOpenChange, onSuccess, drivers, preloadedOrders }: CreateRouteWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasReachedStep3, setHasReachedStep3] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<
    Array<{ id: number; mode: 'pickup_only' | 'delivery_only' | 'both' }>
  >([]);

  const createRouteMutation = trpc.portal.drivers.createRoute.useMutation();
  const addOrdersMutation = trpc.portal.drivers.addOrdersToRoute.useMutation();

  const { data: availableOrders, isLoading: ordersLoading } =
    trpc.portal.drivers.getAvailableOrders.useQuery(undefined, {
      enabled: open && hasReachedStep3,
    });

  // failed_pickup/failed_delivery are still assignable (for a retry) but shouldn't
  // clutter this picker — same default-hide rule as the dispatch map. Orders already
  // selected (e.g. preloaded from the dispatch map's explicit status filter) stay
  // visible so they can still be reviewed/deselected here.
  const pickableOrders = useMemo(() => {
    const selectedIds = new Set(selectedOrders.map(o => o.id));
    return (availableOrders as any[] | undefined)?.filter(
      o => !HIDDEN_BY_DEFAULT_STATUSES.has(o.status) || selectedIds.has(o.id),
    );
  }, [availableOrders, selectedOrders]);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(defaultForm);
      setTouched({});
      setIsSubmitting(false);
      setHasReachedStep3(false);
      setSelectedOrders([]);
    } else {
      // Auto-generate a fresh random route ID each time the wizard opens.
      setForm(f => ({ ...f, id: makeRouteId() }));
      if (preloadedOrders && preloadedOrders.length > 0) {
        setSelectedOrders(preloadedOrders);
        setHasReachedStep3(true);
      }
    }
  }, [open]);

  function setField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function touch(field: string) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  const errors: Record<string, string> = {};
  if (touched.date && !form.date) errors.date = 'Requerido';

  function canAdvance(): boolean {
    if (step === 1) return !!form.date; // ID is auto-generated, always present
    return true;
  }

  function touchAll() {
    if (step === 1) setTouched(t => ({ ...t, date: true }));
  }

  function handleNext() {
    touchAll();
    if (!canAdvance()) return;
    if (step === 2) setHasReachedStep3(true);
    setStep(s => s + 1);
  }

  function handleBack() {
    setStep(s => s - 1);
  }

  async function handleCreate() {
    setIsSubmitting(true);
    try {
      const finalZone = form.zone === '__custom__'
        ? form.zoneCustom
        : ZONE_OPTIONS.find(z => z.value === form.zone)?.label ?? form.zone;

      // The server is the source of truth for the ID (it re-checks uniqueness and may
      // regenerate on the rare collision), so use the returned id downstream.
      const created = await createRouteMutation.mutateAsync({
        id: form.id.trim() || undefined,
        date: form.date,
        driverId: form.driverId && form.driverId !== 'none' ? parseInt(form.driverId) : undefined,
        zone: finalZone || undefined,
        vehicleInfo: form.vehicleInfo || undefined,
        startAddress: form.startAddress || undefined,
        startLat: form.startLat || undefined,
        startLng: form.startLng || undefined,
      });
      const newId = created.id;

      if (selectedOrders.length > 0) {
        await addOrdersMutation.mutateAsync({
          routeId: newId,
          orders: selectedOrders,
        });
      }

      toast.success('Ruta creada exitosamente');
      onSuccess(newId);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear la ruta');
    } finally {
      setIsSubmitting(false);
    }
  }

  function textInputClass(field: string) {
    return `w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors ${errors[field] ? 'border-red-500' : 'border-input'}`;
  }

  // ─── Renders de cada paso ──────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Información de la Ruta</span>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="ID de la Ruta">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={form.id}
                    readOnly
                    className="w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 py-2 text-sm font-mono outline-none cursor-default"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setField('id', makeRouteId())}
                  title="Regenerar ID"
                  className="flex-shrink-0 px-3 rounded-lg border border-input bg-background hover:bg-muted/40 transition-colors flex items-center justify-center"
                >
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Generado automáticamente y aleatorio (no editable por seguridad)</p>
            </Field>
            <Field label="Fecha" required error={errors.date}>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setField('date', e.target.value)}
                  onBlur={() => touch('date')}
                  className={`pl-9 ${textInputClass('date')}`}
                />
              </div>
            </Field>
          </div>
          <Field label="Zona (opcional)">
            <select
              value={form.zone}
              onChange={e => setField('zone', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="">Sin zona asignada</option>
              {ZONE_OPTIONS.map(z => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </select>
            {form.zone === '__custom__' && (
              <input
                type="text"
                value={form.zoneCustom}
                onChange={e => setField('zoneCustom', e.target.value)}
                placeholder="Escribe la zona..."
                className={`mt-2 ${textInputClass('zoneCustom')}`}
              />
            )}
          </Field>
          <Field label="Punto de origen (opcional)">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={form.startAddress}
                onChange={e => setField('startAddress', e.target.value)}
                placeholder="Ej: Al Quoz Industrial, Dubai — bodega o punto de partida"
                className={`pl-9 ${textInputClass('startAddress')}`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Si lo indicas, la optimización de ruta arrancará desde aquí. Déjalo vacío para que el sistema elija el mejor punto de inicio.
            </p>
          </Field>
        </div>
      </div>
    );
  }

  function renderStep2() {
    const activeDrivers = drivers.filter(d => d.status === 'active');
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Conductor y Vehículo</span>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Conductor (opcional)">
            <select
              value={form.driverId}
              onChange={e => setField('driverId', e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            >
              <option value="none">Sin asignar</option>
              {activeDrivers.map(driver => (
                <option key={driver.id} value={driver.id.toString()}>
                  {driver.fullName}{driver.vehicleNumber ? ` • ${driver.vehicleNumber}` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Solo se muestran conductores activos</p>
          </Field>
          <Field label="Info del Vehículo (opcional)">
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={form.vehicleInfo}
                onChange={e => setField('vehicleInfo', e.target.value)}
                placeholder="White Van - DXB 12345"
                className={`pl-9 ${textInputClass('vehicleInfo')}`}
              />
            </div>
          </Field>
          <Field label="Notas (opcional)">
            <div className="relative">
              <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <textarea
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Instrucciones especiales para esta ruta..."
                rows={3}
                className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors resize-none"
              />
            </div>
          </Field>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-4">
        <OrderPickList
          orders={pickableOrders}
          loading={ordersLoading}
          value={selectedOrders}
          onChange={setSelectedOrders}
        />
        <p className="text-xs text-muted-foreground text-center">
          Puedes omitir este paso y agregar paquetes después desde el detalle de la ruta
        </p>
      </div>
    );
  }

  function renderStep4() {
    const finalZone = form.zone === '__custom__'
      ? form.zoneCustom
      : ZONE_OPTIONS.find(z => z.value === form.zone)?.label ?? form.zone;
    const assignedDriver = drivers.find(d => d.id.toString() === form.driverId);
    const previewWaybills = selectedOrders
      .slice(0, 3)
      .map(o => (availableOrders as any[])?.find((av: any) => av.id === o.id)?.waybillNumber)
      .filter(Boolean);
    const extra = selectedOrders.length - previewWaybills.length;

    return (
      <div className="space-y-6">
        {/* Resumen */}
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-green-400" /> Resumen de la ruta
          </p>

          {/* Ruta */}
          <div className="space-y-1 text-sm border-b border-border pb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Ruta</p>
            <div className="flex justify-between">
              <span className="text-slate-400">ID</span>
              <span className="font-mono font-semibold">{form.id.trim()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Fecha</span>
              <span>{form.date}</span>
            </div>
            {finalZone && (
              <div className="flex justify-between">
                <span className="text-slate-400">Zona</span>
                <span>{finalZone}</span>
              </div>
            )}
            {form.startAddress && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400 flex-shrink-0">Origen</span>
                <span className="text-right text-slate-300 truncate">{form.startAddress}</span>
              </div>
            )}
          </div>

          {/* Conductor */}
          <div className="space-y-1 text-sm border-b border-border pb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Conductor</p>
            <div className="flex justify-between">
              <span className="text-slate-400">Conductor</span>
              <span>{assignedDriver?.fullName || 'Sin asignar'}</span>
            </div>
            {form.vehicleInfo && (
              <div className="flex justify-between">
                <span className="text-slate-400">Vehículo</span>
                <span>{form.vehicleInfo}</span>
              </div>
            )}
            {form.notes && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400 flex-shrink-0">Notas</span>
                <span className="text-right text-slate-300">{form.notes}</span>
              </div>
            )}
          </div>

          {/* Paquetes */}
          <div className="space-y-1 text-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Paquetes</p>
            {selectedOrders.length === 0 ? (
              <p className="text-slate-400 text-sm">Sin paquetes — se pueden agregar después</p>
            ) : (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Órdenes</span>
                  <span className="font-semibold">{selectedOrders.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {previewWaybills.map((wb: string) => (
                    <span key={wb} className="text-xs font-mono bg-white/10 px-2 py-0.5 rounded">{wb}</span>
                  ))}
                  {extra > 0 && (
                    <span className="text-xs text-slate-400">+{extra} más</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nota QR */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <QrCode className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Se generará un código QR automáticamente al crear la ruta para que el conductor pueda escanearla.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border !w-[95vw] !max-w-[1040px] max-h-[95vh] overflow-y-auto p-0 gap-0 ">
        <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-600 flex-shrink-0" />

        <div className="p-6 pb-0 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <MapPin className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Nueva Ruta</h2>
              <p className="text-xs text-muted-foreground">Completa los pasos para crear la ruta de entrega</p>
            </div>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center mb-8">
            {STEPS.map((s, idx) => {
              const isCompleted = step > s.id;
              const isActive = step === s.id;
              const Icon = s.icon;
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        isCompleted
                          ? 'bg-primary text-primary-foreground'
                          : isActive
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        isActive ? 'text-foreground' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-5 rounded-full transition-all ${isCompleted ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="px-6 pb-6 min-w-0">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Navegación */}
          <div className={`flex gap-3 mt-6 ${step > 1 ? 'flex-row' : 'flex-row-reverse'}`}>
            {step === 4 ? (
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creando...</>
                ) : (
                  <><MapPin className="w-5 h-5" /> Crear Ruta</>
                )}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!canAdvance()}
                className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight className="w-5 h-5" />
              </button>
            )}
            {step > 1 && (
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="py-4 px-6 bg-white/10 text-foreground rounded-xl font-bold text-sm hover:bg-white/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

