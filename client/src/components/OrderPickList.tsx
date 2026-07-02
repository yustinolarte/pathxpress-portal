import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Package, Search, Loader2, MapPin, Users, Building2,
  DollarSign, RotateCcw, RefreshCw, CheckCircle2,
} from 'lucide-react';

export type OrderMode = 'pickup_only' | 'delivery_only' | 'both';
export interface SelectedOrder { id: number; mode: OrderMode; }

interface OrderPickListProps {
  orders: any[] | undefined;
  loading?: boolean;
  value: SelectedOrder[];
  onChange: (next: SelectedOrder[]) => void;
  /** Tailwind max-height class for the scroll area. */
  maxHeightClass?: string;
}

const MODE_META: Record<OrderMode, { label: string }> = {
  both: { label: '🔄 Pickup + Entrega' },
  pickup_only: { label: '📦 Solo Pickup' },
  delivery_only: { label: '🚚 Solo Entrega' },
};

/** Which modes an order can be assigned to, derived from the backend availability flags. */
function allowedModes(order: any): OrderMode[] {
  // Older data / fallback: if flags are absent, allow everything.
  const canPickup = order.canPickup ?? true;
  const canDeliver = order.canDeliver ?? true;
  // "both" bundles the pickup + delivery legs into the same route, so it doesn't require the
  // package to already be picked up — only that neither leg is already done/occupied elsewhere.
  const canBoth = order.canBoth ?? (canPickup && canDeliver);
  const modes: OrderMode[] = [];
  if (canBoth) modes.push('both');
  if (canPickup) modes.push('pickup_only');
  if (canDeliver) modes.push('delivery_only');
  return modes;
}

function defaultModeFor(order: any): OrderMode {
  return (order.defaultMode as OrderMode) ?? allowedModes(order)[0] ?? 'both';
}

/**
 * Shared, roomy order-selection list used by both the route creation wizard and the
 * "Add Orders" dialog. Each row is a spacious card; the pickup/delivery mode control
 * opens on its own full-width row when the order is selected, and only offers modes
 * that are still assignable for that package.
 */
export default function OrderPickList({
  orders,
  loading = false,
  value,
  onChange,
  maxHeightClass = 'max-h-[60vh]',
}: OrderPickListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = orders || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((o: any) =>
      o.waybillNumber?.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.city?.toLowerCase().includes(q),
    );
  }, [orders, search]);

  const byId = useMemo(() => new Map(value.map(v => [v.id, v.mode])), [value]);

  function toggle(order: any) {
    if (byId.has(order.id)) {
      onChange(value.filter(v => v.id !== order.id));
    } else {
      onChange([...value, { id: order.id, mode: defaultModeFor(order) }]);
    }
  }

  function setMode(orderId: number, mode: OrderMode) {
    onChange(value.map(v => (v.id === orderId ? { ...v, mode } : v)));
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por waybill, cliente o ciudad..."
          className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
        />
      </div>

      {/* Selected banner */}
      {value.length > 0 && (
        <div className="p-3 rounded-lg bg-primary/10 border border-border flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm text-primary font-medium">
            {value.length} orden{value.length > 1 ? 'es' : ''} seleccionada{value.length > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* List */}
      <div className={`${maxHeightClass} overflow-y-auto overflow-x-hidden rounded-xl border border-border`}>
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando órdenes...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Package className="w-8 h-8 opacity-30" />
            <p className="text-sm">No hay órdenes disponibles para asignar</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((order: any) => {
              const selectedMode = byId.get(order.id);
              const isSelected = selectedMode !== undefined;
              const isReturn = order.isReturn === 1 || order.orderType === 'return';
              const isExchange = order.orderType === 'exchange';
              const modes = allowedModes(order);
              return (
                <div
                  key={order.id}
                  onClick={() => toggle(order)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(order)}
                      className="h-4 w-4 mt-1 rounded border-gray-300 flex-shrink-0"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-medium text-sm">{order.waybillNumber}</span>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                          <Building2 className="w-3 h-3 mr-1" />{order.companyName}
                        </Badge>
                        {isReturn && (
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/30 text-xs">
                            <RotateCcw className="w-3 h-3 mr-1" />Retorno
                          </Badge>
                        )}
                        {isExchange && (
                          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs">
                            <RefreshCw className="w-3 h-3 mr-1" />Cambio
                          </Badge>
                        )}
                        {order.serviceType === 'same-day' && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">⚡ Same Day</Badge>
                        )}
                        {order.serviceType === 'express' && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-xs">⚡ Express</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm mb-1 min-w-0">
                        <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium flex-shrink-0">{order.customerName}</span>
                        <span className="text-muted-foreground flex-shrink-0">•</span>
                        <span className="text-muted-foreground truncate min-w-0">{order.address}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{order.city}{order.emirate ? `, ${order.emirate}` : ''}
                        </span>
                        <span>{order.pieces} pieza{order.pieces > 1 ? 's' : ''} • {order.weight} kg</span>
                        {order.codRequired ? (
                          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-xs">
                            <DollarSign className="w-3 h-3 mr-0.5" />COD {order.codAmount} AED
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/30 text-xs">Prepago</Badge>
                        )}
                      </div>

                      {/* Mode control — own row, only when selected */}
                      {isSelected && (
                        <div onClick={e => e.stopPropagation()} className="mt-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                            Tipo de parada
                          </p>
                          <div className="grid grid-cols-3 gap-2 w-full">
                            {(['both', 'pickup_only', 'delivery_only'] as OrderMode[]).map(mode => {
                              const enabled = modes.includes(mode);
                              const active = selectedMode === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  disabled={!enabled}
                                  onClick={() => enabled && setMode(order.id, mode)}
                                  className={`min-w-0 py-2.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center leading-tight ${
                                    active
                                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                      : enabled
                                      ? 'bg-background border-input hover:border-primary/50 hover:bg-muted/40'
                                      : 'bg-muted/30 border-border text-muted-foreground/40 cursor-not-allowed'
                                  }`}
                                >
                                  {MODE_META[mode].label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
