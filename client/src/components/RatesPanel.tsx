import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, MapPin, Package, Pencil, Save, Settings, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

// ─── Zone rates ────────────────────────────────────────────────────────────────

type ZoneDraft = {
  zone1BaseRate: string; zone1PerKg: string;
  zone2BaseRate: string; zone2PerKg: string;
  zone3BaseRate: string; zone3PerKg: string;
  sddBaseRate: string;   sddPerKg: string;
};

const ZONE_MAP = {
  'Zone 1': ['Dubai', 'Sharjah', 'Ajman', 'Abu Dhabi'],
  'Zone 2': ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  'Zone 3': ['Remote areas', '(Al Ain, Liwa, Ruwais,', 'RAK remote, etc.)'],
};

// ─── Service settings ──────────────────────────────────────────────────────────

const UAE_REGIONS = ['Dubai', 'Sharjah', 'Ajman', 'Abu Dhabi', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

const SERVICE_DEFS = [
  { code: 'DOM',            label: 'Next Day Delivery (DOM)',     icon: 'local_shipping', color: 'text-[var(--st-blue)]',  border: 'border-border', bg: 'bg-[var(--st-blue-bg)]',  hasWindow: false, hasExtraConfig: false },
  { code: 'SDD',            label: 'Same Day Delivery (SDD)',     icon: 'bolt',           color: 'text-[var(--st-green)]', border: 'border-border', bg: 'bg-[var(--st-green-bg)]', hasWindow: true,  hasExtraConfig: false },
  { code: 'BULLET',         label: 'Bullet Service (4-Hour)',     icon: 'rocket_launch',  color: 'text-primary',           border: 'border-primary/25', bg: 'bg-primary/10',       hasWindow: false, hasExtraConfig: false },
  { code: 'EXPRESS_ZONE2',  label: 'Express Zone 2',              icon: 'speed',          color: 'text-[var(--st-amber)]', border: 'border-border', bg: 'bg-[var(--st-amber-bg)]', hasWindow: false, hasExtraConfig: false },
  { code: 'PREFERRED_TIME', label: 'Next Day Preferred Time',     icon: 'schedule',       color: 'text-foreground',        border: 'border-border', bg: 'bg-secondary',            hasWindow: false, hasExtraConfig: true  },
  { code: 'PREFERRED_TIME_SDD', label: 'Same Day Preferred Time', icon: 'schedule',       color: 'text-foreground',        border: 'border-border', bg: 'bg-secondary',            hasWindow: false, hasExtraConfig: true  },
] as const;

type ServiceCode = typeof SERVICE_DEFS[number]['code'];

interface ServiceDraft {
  isEnabled: boolean;
  baseRate: string; perKgRate: string;
  cutoffTime: string;
  availableRegions: string[];
  deliveryWindow: string; deliveryTime: string;
  displayName: string; description: string;
  timeSlots: string; blackoutDates: string;
}

function emptyDraft(code: ServiceCode): ServiceDraft {
  return {
    isEnabled: false, baseRate: '', perKgRate: '', cutoffTime: '',
    availableRegions: code === 'EXPRESS_ZONE2' ? ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'] : [...UAE_REGIONS],
    deliveryWindow: '', deliveryTime: '', displayName: '', description: '', timeSlots: '', blackoutDates: '',
  };
}

function rowToDraft(setting: any, code: ServiceCode): ServiceDraft {
  let regions: string[] = [];
  try { regions = setting.availableRegions ? JSON.parse(setting.availableRegions) : []; } catch {}
  let extra: any = {};
  try { extra = setting.extraConfig ? JSON.parse(setting.extraConfig) : {}; } catch {}
  return {
    isEnabled: setting.isEnabled === 1,
    baseRate: setting.baseRate ?? '', perKgRate: setting.perKgRate ?? '',
    cutoffTime: setting.cutoffTime ?? '',
    availableRegions: regions.length ? regions : (code === 'EXPRESS_ZONE2' ? ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'] : [...UAE_REGIONS]),
    deliveryWindow: setting.deliveryWindow ?? '', deliveryTime: setting.deliveryTime ?? '',
    displayName: setting.displayName ?? '', description: setting.description ?? '',
    timeSlots: Array.isArray(extra.timeSlots) ? extra.timeSlots.join(', ') : '',
    blackoutDates: Array.isArray(extra.blackoutDates) ? extra.blackoutDates.join(', ') : '',
  };
}

const inputCls = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const labelCls = 'text-[10px] font-bold text-muted-foreground uppercase tracking-wider';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RatesPanel() {
  // Zone rates state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ZoneDraft>({
    zone1BaseRate: '', zone1PerKg: '', zone2BaseRate: '', zone2PerKg: '',
    zone3BaseRate: '', zone3PerKg: '', sddBaseRate: '', sddPerKg: '',
  });

  // Service settings state
  const [serviceClientId, setServiceClientId] = useState<number | null>(null);
  const [serviceClientName, setServiceClientName] = useState('');
  const [expandedService, setExpandedService] = useState<ServiceCode | null>(null);
  const [svcDrafts, setSvcDrafts] = useState<Partial<Record<ServiceCode, ServiceDraft>>>({});

  // Data
  const { data: clients, isLoading, refetch } = trpc.portal.clients.getWithTiers.useQuery();
  const { data: svcSettings, refetch: refetchSvc } = trpc.portal.clients.getServiceSettings.useQuery(
    { clientId: serviceClientId! },
    { enabled: serviceClientId !== null }
  );

  // Mutations
  const updateZoneMutation = trpc.portal.clients.updateZoneRates.useMutation({
    onSuccess: () => { toast.success('Zone rates saved.'); setEditingId(null); refetch(); },
    onError: () => toast.error('Failed to save rates.'),
  });

  const upsertSvcMutation = trpc.portal.clients.upsertServiceSetting.useMutation({
    onSuccess: () => { toast.success('Service settings saved.'); refetchSvc(); },
    onError: (e) => toast.error(e.message || 'Failed to save.'),
  });

  // Zone rates helpers
  function startEdit(client: any) {
    setEditingId(client.id);
    setDraft({
      zone1BaseRate: client.zone1BaseRate     ?? '', zone1PerKg: client.zone1PerKg       ?? '',
      zone2BaseRate: client.zone2BaseRate     ?? '', zone2PerKg: client.zone2PerKg       ?? '',
      zone3BaseRate: client.zone3BaseRate     ?? '', zone3PerKg: client.zone3PerKg       ?? '',
      sddBaseRate:   client.customSddBaseRate ?? '', sddPerKg:   client.customSddPerKg   ?? '',
    });
  }

  function saveEdit(clientId: number) {
    updateZoneMutation.mutate({
      clientId,
      zone1BaseRate: draft.zone1BaseRate || undefined, zone1PerKg: draft.zone1PerKg || undefined,
      zone2BaseRate: draft.zone2BaseRate || undefined, zone2PerKg: draft.zone2PerKg || undefined,
      zone3BaseRate: draft.zone3BaseRate || undefined, zone3PerKg: draft.zone3PerKg || undefined,
      sddBaseRate:   draft.sddBaseRate   || undefined, sddPerKg:   draft.sddPerKg   || undefined,
    });
  }

  function formatRate(base: string | null, perKg: string | null) {
    if (!base) return <span className="text-muted-foreground">—</span>;
    return (
      <span>
        <span className="money">{base} AED</span>
        {perKg && <span className="text-muted-foreground text-xs ml-1">+{perKg}/kg</span>}
      </span>
    );
  }

  // Service settings helpers
  function openServiceSettings(client: any) {
    if (serviceClientId === client.id) {
      setServiceClientId(null);
      setServiceClientName('');
      setSvcDrafts({});
      setExpandedService(null);
    } else {
      setServiceClientId(client.id);
      setServiceClientName(client.companyName);
      setSvcDrafts({});
      setExpandedService(null);
    }
  }

  function getSvcDraft(code: ServiceCode): ServiceDraft {
    if (svcDrafts[code]) return svcDrafts[code]!;
    const existing = svcSettings?.find((s: any) => s.serviceCode === code);
    return existing ? rowToDraft(existing, code) : emptyDraft(code);
  }

  function updateSvcDraft(code: ServiceCode, patch: Partial<ServiceDraft>) {
    setSvcDrafts(prev => ({ ...prev, [code]: { ...getSvcDraft(code), ...patch } }));
  }

  function toggleRegion(code: ServiceCode, region: string) {
    const d = getSvcDraft(code);
    const next = d.availableRegions.includes(region)
      ? d.availableRegions.filter(r => r !== region)
      : [...d.availableRegions, region];
    updateSvcDraft(code, { availableRegions: next });
  }

  function saveSvc(code: ServiceCode) {
    if (!serviceClientId) return;
    const d = getSvcDraft(code);
    const extra: any = {};
    if (code === 'PREFERRED_TIME' || code === 'PREFERRED_TIME_SDD') {
      const slots = d.timeSlots.split(',').map(s => s.trim()).filter(Boolean);
      const dates = d.blackoutDates.split(',').map(s => s.trim()).filter(Boolean);
      if (slots.length) extra.timeSlots = slots;
      if (dates.length) extra.blackoutDates = dates;
    }
    upsertSvcMutation.mutate({
      clientId: serviceClientId,
      serviceCode: code,
      isEnabled: d.isEnabled,
      baseRate: d.baseRate || undefined,
      perKgRate: d.perKgRate || undefined,
      cutoffTime: d.cutoffTime || undefined,
      availableRegions: d.availableRegions,
      deliveryWindow: d.deliveryWindow || undefined,
      deliveryTime: d.deliveryTime || undefined,
      displayName: d.displayName || undefined,
      description: d.description || undefined,
      extraConfig: Object.keys(extra).length ? extra : undefined,
    });
  }

  return (
    <div className="space-y-6">

      {/* Zone Map */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Delivery Zones — UAE</CardTitle>
          </div>
          <CardDescription>Zone classification by emirate/area</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(ZONE_MAP).map(([zone, areas], idx) => (
              <div key={zone} className="p-3 rounded-lg border border-border bg-secondary">
                <p className="font-display font-semibold text-sm mb-2" style={{ color: idx === 0 ? 'var(--st-green)' : idx === 1 ? 'var(--st-amber)' : 'var(--primary)' }}>{zone}</p>
                {areas.map(a => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Client Rates Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Client Rates</CardTitle>
          </div>
          <CardDescription>
            Base rate covers 0–5 kg. Additional per-kg charge applies above 5 kg. SDD applies Zone 1 only.
            Click <Settings className="inline w-3 h-3 mx-1" /> to configure delivery services (cut-off, on/off, BULLET, Express Zone 2, Preferred Time) for each client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : (
            <div className="space-y-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[160px]">Client</TableHead>
                      <TableHead>
                        <span style={{ color: 'var(--st-green)' }}>DOM Zone 1</span>
                        <span className="text-muted-foreground text-xs block font-normal">Dubai / Sharjah / Ajman / AD</span>
                      </TableHead>
                      <TableHead>
                        <span style={{ color: 'var(--st-amber)' }}>DOM Zone 2</span>
                        <span className="text-muted-foreground text-xs block font-normal">UAQ / RAK / Fujairah</span>
                      </TableHead>
                      <TableHead>
                        <span className="text-primary">DOM Zone 3</span>
                        <span className="text-muted-foreground text-xs block font-normal">Remote areas</span>
                      </TableHead>
                      <TableHead>
                        <span style={{ color: 'var(--st-blue)' }}>SDD</span>
                        <span className="text-muted-foreground text-xs block font-normal">Zone 1 only</span>
                      </TableHead>
                      <TableHead className="w-[110px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(clients || []).map((client: any) => {
                      const isEditing = editingId === client.id;
                      const svcOpen = serviceClientId === client.id;
                      return (
                        <TableRow key={client.id} className={svcOpen ? 'bg-primary/5' : ''}>
                          <TableCell>
                            <p className="font-medium text-sm">{client.companyName}</p>
                            <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-4 mt-1">
                              {client.status}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone1BaseRate} onChange={e => setDraft(d => ({ ...d, zone1BaseRate: e.target.value }))} />
                                <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone1PerKg} onChange={e => setDraft(d => ({ ...d, zone1PerKg: e.target.value }))} />
                              </div>
                            ) : formatRate(client.zone1BaseRate, client.zone1PerKg)}
                          </TableCell>

                          <TableCell>
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone2BaseRate} onChange={e => setDraft(d => ({ ...d, zone2BaseRate: e.target.value }))} />
                                <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone2PerKg} onChange={e => setDraft(d => ({ ...d, zone2PerKg: e.target.value }))} />
                              </div>
                            ) : formatRate(client.zone2BaseRate, client.zone2PerKg)}
                          </TableCell>

                          <TableCell>
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone3BaseRate} onChange={e => setDraft(d => ({ ...d, zone3BaseRate: e.target.value }))} />
                                <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone3PerKg} onChange={e => setDraft(d => ({ ...d, zone3PerKg: e.target.value }))} />
                              </div>
                            ) : formatRate(client.zone3BaseRate, client.zone3PerKg)}
                          </TableCell>

                          <TableCell>
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.sddBaseRate} onChange={e => setDraft(d => ({ ...d, sddBaseRate: e.target.value }))} />
                                <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.sddPerKg} onChange={e => setDraft(d => ({ ...d, sddPerKg: e.target.value }))} />
                              </div>
                            ) : formatRate(client.customSddBaseRate, client.customSddPerKg)}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {isEditing ? (
                                <>
                                  <Button size="sm" variant="default" className="h-7 px-2" onClick={() => saveEdit(client.id)} disabled={updateZoneMutation.isPending}>
                                    <Save className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                                    <X className="w-3 h-3" />
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-primary" onClick={() => startEdit(client)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              )}
                              {/* Service Settings toggle */}
                              <Button
                                size="sm"
                                variant={svcOpen ? 'default' : 'ghost'}
                                className={`h-7 px-2 ${svcOpen ? '' : 'text-muted-foreground hover:text-primary'}`}
                                title="Configure delivery services"
                                onClick={() => openServiceSettings(client)}
                              >
                                <Settings className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* ── Service Settings Panel (expands inline below the table) ── */}
              {serviceClientId !== null && (
                <div className="mt-4 border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-primary/5 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-4 h-4 text-primary" />
                      <span className="font-bold text-sm">Delivery Service Settings — {serviceClientName}</span>
                    </div>
                    <button
                      onClick={() => { setServiceClientId(null); setSvcDrafts({}); setExpandedService(null); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-4 space-y-2 bg-card">
                    {SERVICE_DEFS.map((svc) => {
                      const d = getSvcDraft(svc.code);
                      const isExpanded = expandedService === svc.code;
                      const existing = svcSettings?.find((s: any) => s.serviceCode === svc.code);

                      return (
                        <div key={svc.code} className={`border rounded-xl overflow-hidden ${isExpanded ? svc.border : 'border-border'}`}>
                          {/* Row header */}
                          <div
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? svc.bg : ''}`}
                            onClick={() => setExpandedService(isExpanded ? null : svc.code)}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${svc.bg}`}>
                                <span className={`material-symbols-outlined text-base ${svc.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                                  {svc.icon}
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-sm">{svc.label}</span>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {existing ? (
                                    <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full ${existing.isEnabled === 1 ? 'bg-[var(--st-green-bg)] text-[var(--st-green)]' : 'bg-muted text-muted-foreground'}`}>
                                      {existing.isEnabled === 1 ? 'ON' : 'OFF'}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">Not configured</span>
                                  )}
                                  {existing?.baseRate && <span className="text-[10px] text-muted-foreground">AED {existing.baseRate}</span>}
                                  {existing?.cutoffTime && <span className="text-[10px] text-muted-foreground">Cut-off {existing.cutoffTime}</span>}
                                </div>
                              </div>
                            </div>
                            <span className={`material-symbols-outlined text-muted-foreground text-lg transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                          </div>

                          {/* Expanded form */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-3 border-t border-border space-y-4 bg-card">

                              {/* Toggle + Pricing */}
                              <div className="grid grid-cols-3 gap-4 items-end">
                                <div className="space-y-1">
                                  <label className={labelCls}>Status</label>
                                  <button
                                    type="button"
                                    onClick={() => updateSvcDraft(svc.code, { isEnabled: !d.isEnabled })}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all w-full ${d.isEnabled ? 'bg-[var(--st-green-bg)] border-[var(--st-green)]/30 text-[var(--st-green)]' : 'bg-muted border-border text-muted-foreground'}`}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${d.isEnabled ? 'bg-[var(--st-green)]' : 'bg-muted-foreground'}`} />
                                    {d.isEnabled ? 'Enabled' : 'Disabled'}
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <label className={labelCls}>Base Rate AED (0–5 kg)</label>
                                  <input type="number" step="0.01" placeholder="e.g. 12.00" value={d.baseRate} onChange={e => updateSvcDraft(svc.code, { baseRate: e.target.value })} className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                  <label className={labelCls}>Per Extra Kg (AED)</label>
                                  <input type="number" step="0.01" placeholder="e.g. 1.50" value={d.perKgRate} onChange={e => updateSvcDraft(svc.code, { perKgRate: e.target.value })} className={inputCls} />
                                </div>
                              </div>

                              {/* Cut-off + Window + Delivery time */}
                              <div className={`grid gap-4 ${svc.hasWindow ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                <div className="space-y-1">
                                  <label className={labelCls}>Cut-off Time (Dubai)</label>
                                  <input type="time" value={d.cutoffTime} onChange={e => updateSvcDraft(svc.code, { cutoffTime: e.target.value })} className={inputCls} />
                                  <p className="text-[10px] text-muted-foreground">After this time → Not Available</p>
                                </div>
                                {svc.hasWindow && (
                                  <div className="space-y-1">
                                    <label className={labelCls}>Delivery Window</label>
                                    <input type="text" placeholder="e.g. 6:00 PM – 11:00 PM" value={d.deliveryWindow} onChange={e => updateSvcDraft(svc.code, { deliveryWindow: e.target.value })} className={inputCls} />
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <label className={labelCls}>Delivery Time Label</label>
                                  <input type="text" placeholder="e.g. 1–2 business days" value={d.deliveryTime} onChange={e => updateSvcDraft(svc.code, { deliveryTime: e.target.value })} className={inputCls} />
                                </div>
                              </div>

                              {/* Display name + Description */}
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className={labelCls}>Display Name (optional override)</label>
                                  <input type="text" placeholder="Override visible name" value={d.displayName} onChange={e => updateSvcDraft(svc.code, { displayName: e.target.value })} className={inputCls} />
                                </div>
                                <div className="space-y-1">
                                  <label className={labelCls}>Description (shown to client)</label>
                                  <input type="text" placeholder="Short description" value={d.description} onChange={e => updateSvcDraft(svc.code, { description: e.target.value })} className={inputCls} />
                                </div>
                              </div>

                              {/* Available Regions */}
                              <div className="space-y-2">
                                <label className={labelCls}>Available Regions</label>
                                <div className="flex flex-wrap gap-2">
                                  {UAE_REGIONS.map(region => (
                                    <button
                                      key={region}
                                      type="button"
                                      onClick={() => toggleRegion(svc.code, region)}
                                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${d.availableRegions.includes(region) ? `${svc.bg} ${svc.border} ${svc.color}` : 'border-border text-muted-foreground hover:bg-muted'}`}
                                    >
                                      {region}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* PREFERRED_TIME extra config */}
                              {svc.hasExtraConfig && (
                                <div className="grid grid-cols-2 gap-4 p-3 bg-secondary border border-border rounded-lg">
                                  <div className="space-y-1">
                                    <label className={labelCls}>Time Slots (comma-separated)</label>
                                    <input type="text" placeholder="10:00, 14:00, 18:00" value={d.timeSlots} onChange={e => updateSvcDraft(svc.code, { timeSlots: e.target.value })} className={inputCls} />
                                    <p className="text-[10px] text-muted-foreground">Leave empty for free time input</p>
                                  </div>
                                  <div className="space-y-1">
                                    <label className={labelCls}>Blackout Dates (YYYY-MM-DD, comma-separated)</label>
                                    <input type="text" placeholder="2025-12-25, 2026-01-01" value={d.blackoutDates} onChange={e => updateSvcDraft(svc.code, { blackoutDates: e.target.value })} className={inputCls} />
                                  </div>
                                </div>
                              )}

                              {/* Save */}
                              <div className="flex justify-end pt-1">
                                <Button onClick={() => saveSvc(svc.code)} disabled={upsertSvcMutation.isPending} size="sm" className="gap-1.5">
                                  <Save className="w-3.5 h-3.5" />
                                  {upsertSvcMutation.isPending ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* COD Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Cash on Delivery (COD) Configuration
          </CardTitle>
          <CardDescription>COD fee structure for both DOM and SDD services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">COD Fee Percentage</p>
                <p className="text-sm text-muted-foreground">Applied to collected amount</p>
              </div>
              <span className="money text-2xl" style={{ color: 'var(--st-green)' }}>3.3%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">Minimum COD Fee</p>
                <p className="text-sm text-muted-foreground">Minimum charge regardless of amount</p>
              </div>
              <span className="money text-2xl" style={{ color: 'var(--st-green)' }}>2.00 AED</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">Maximum COD Amount</p>
                <p className="text-sm text-muted-foreground">Per shipment limit</p>
              </div>
              <span className="money text-2xl" style={{ color: 'var(--st-green)' }}>3,000 AED</span>
            </div>
            <div className="p-4 bg-secondary rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> COD fees are calculated as 3.3% of the collected value, with a minimum of 2 AED.
                Settlement is processed on a weekly or bi-weekly basis as per client agreement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

