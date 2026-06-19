import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

const UAE_REGIONS = ['Dubai', 'Sharjah', 'Ajman', 'Abu Dhabi', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

const SERVICE_DEFS = [
  {
    code: 'DOM',
    label: 'Next Day Delivery (DOM)',
    icon: 'local_shipping',
    color: 'text-[var(--st-blue)]',
    bgColor: 'bg-[var(--st-blue-bg)]',
    borderColor: 'border-border',
    defaultDeliveryTime: '1–2 business days',
    hasWindow: false,
    hasExtraConfig: false,
  },
  {
    code: 'SDD',
    label: 'Same Day Delivery (SDD)',
    icon: 'bolt',
    color: 'text-[var(--st-green)]',
    bgColor: 'bg-[var(--st-green-bg)]',
    borderColor: 'border-border',
    defaultDeliveryTime: null,
    hasWindow: true,
    hasExtraConfig: false,
  },
  {
    code: 'BULLET',
    label: 'Bullet Service (4-Hour)',
    icon: 'rocket_launch',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/25',
    defaultDeliveryTime: 'Up to 4 hours',
    hasWindow: false,
    hasExtraConfig: false,
  },
  {
    code: 'EXPRESS_ZONE2',
    label: 'Express Service – Zone 2',
    icon: 'speed',
    color: 'text-[var(--st-amber)]',
    bgColor: 'bg-[var(--st-amber-bg)]',
    borderColor: 'border-border',
    defaultDeliveryTime: 'Express delivery',
    hasWindow: false,
    hasExtraConfig: false,
  },
  {
    code: 'PREFERRED_TIME',
    label: 'Next Day Preferred Time',
    icon: 'schedule',
    color: 'text-foreground',
    bgColor: 'bg-secondary',
    borderColor: 'border-border',
    defaultDeliveryTime: 'Next day · scheduled',
    hasWindow: false,
    hasExtraConfig: true,
  },
  {
    code: 'PREFERRED_TIME_SDD',
    label: 'Same Day Preferred Time',
    icon: 'schedule',
    color: 'text-foreground',
    bgColor: 'bg-secondary',
    borderColor: 'border-border',
    defaultDeliveryTime: 'Same day · scheduled',
    hasWindow: false,
    hasExtraConfig: true,
  },
] as const;

type ServiceCode = typeof SERVICE_DEFS[number]['code'];

interface ServiceDraft {
  isEnabled: boolean;
  baseRate: string;
  perKgRate: string;
  cutoffTime: string;
  availableRegions: string[];
  deliveryWindow: string;
  deliveryTime: string;
  displayName: string;
  description: string;
  timeSlots: string; // comma-separated for PREFERRED_TIME
  blackoutDates: string; // comma-separated for PREFERRED_TIME
}

function emptyDraft(code: ServiceCode): ServiceDraft {
  const def = SERVICE_DEFS.find(s => s.code === code)!;
  return {
    isEnabled: false,
    baseRate: '',
    perKgRate: '',
    cutoffTime: '',
    availableRegions: code === 'EXPRESS_ZONE2'
      ? ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
      : [...UAE_REGIONS],
    deliveryWindow: '',
    deliveryTime: def.defaultDeliveryTime ?? '',
    displayName: '',
    description: '',
    timeSlots: '',
    blackoutDates: '',
  };
}

function settingToDraft(setting: any, code: ServiceCode): ServiceDraft {
  const def = SERVICE_DEFS.find(s => s.code === code)!;
  let regions: string[] = [];
  try { regions = setting.availableRegions ? JSON.parse(setting.availableRegions) : []; } catch {}
  let extraConfig: any = {};
  try { extraConfig = setting.extraConfig ? JSON.parse(setting.extraConfig) : {}; } catch {}
  return {
    isEnabled: setting.isEnabled === 1,
    baseRate: setting.baseRate ?? '',
    perKgRate: setting.perKgRate ?? '',
    cutoffTime: setting.cutoffTime ?? '',
    availableRegions: regions.length ? regions : (code === 'EXPRESS_ZONE2'
      ? ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
      : [...UAE_REGIONS]),
    deliveryWindow: setting.deliveryWindow ?? '',
    deliveryTime: setting.deliveryTime ?? (def.defaultDeliveryTime ?? ''),
    displayName: setting.displayName ?? '',
    description: setting.description ?? '',
    timeSlots: Array.isArray(extraConfig.timeSlots) ? extraConfig.timeSlots.join(', ') : '',
    blackoutDates: Array.isArray(extraConfig.blackoutDates) ? extraConfig.blackoutDates.join(', ') : '',
  };
}

const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
const labelClass = 'text-xs font-bold text-muted-foreground uppercase tracking-wider';

export default function ServiceSettingsPanel() {
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [expandedService, setExpandedService] = useState<ServiceCode | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ServiceCode, ServiceDraft>>>({});

  const { data: clients } = trpc.portal.clients.list.useQuery();
  const { data: settings, refetch } = trpc.portal.clients.getServiceSettings.useQuery(
    { clientId: selectedClientId! },
    { enabled: selectedClientId !== null }
  );

  const upsertMutation = trpc.portal.clients.upsertServiceSetting.useMutation({
    onSuccess: () => {
      toast.success('Service settings saved.');
      refetch();
    },
    onError: (err) => toast.error(err.message || 'Failed to save settings.'),
  });

  function handleClientChange(clientId: number) {
    setSelectedClientId(clientId);
    setDrafts({});
    setExpandedService(null);
  }

  function getDraft(code: ServiceCode): ServiceDraft {
    if (drafts[code]) return drafts[code]!;
    const existing = settings?.find((s: any) => s.serviceCode === code);
    return existing ? settingToDraft(existing, code) : emptyDraft(code);
  }

  function updateDraft(code: ServiceCode, patch: Partial<ServiceDraft>) {
    setDrafts(prev => ({ ...prev, [code]: { ...getDraft(code), ...patch } }));
  }

  function toggleRegion(code: ServiceCode, region: string) {
    const d = getDraft(code);
    const next = d.availableRegions.includes(region)
      ? d.availableRegions.filter(r => r !== region)
      : [...d.availableRegions, region];
    updateDraft(code, { availableRegions: next });
  }

  function handleSave(code: ServiceCode) {
    if (!selectedClientId) return;
    const d = getDraft(code);
    const extraConfig: any = {};
    if (code === 'PREFERRED_TIME' || code === 'PREFERRED_TIME_SDD') {
      const slots = d.timeSlots.split(',').map(s => s.trim()).filter(Boolean);
      const dates = d.blackoutDates.split(',').map(s => s.trim()).filter(Boolean);
      if (slots.length) extraConfig.timeSlots = slots;
      if (dates.length) extraConfig.blackoutDates = dates;
    }
    upsertMutation.mutate({
      clientId: selectedClientId,
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
      extraConfig: Object.keys(extraConfig).length ? extraConfig : undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black">Service Settings</h2>
        <p className="text-sm text-muted-foreground">Configure delivery services per client — enable/disable, pricing, cut-off, and regions.</p>
      </div>

      {/* Client selector */}
      <div className="max-w-sm">
        <label className={labelClass + ' block mb-2'}>Select Client</label>
        <select
          className={inputClass}
          value={selectedClientId ?? ''}
          onChange={e => handleClientChange(Number(e.target.value))}
        >
          <option value="">— Choose a client —</option>
          {clients?.map((c: any) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </select>
      </div>

      {!selectedClientId && (
        <div className="flex items-center gap-3 p-6 bg-muted/30 border border-border rounded-xl text-muted-foreground">
          <span className="material-symbols-outlined">person_search</span>
          <span className="text-sm">Select a client to configure their delivery services.</span>
        </div>
      )}

      {selectedClientId && (
        <div className="space-y-3">
          {SERVICE_DEFS.map((svc) => {
            const d = getDraft(svc.code);
            const isExpanded = expandedService === svc.code;
            const existing = settings?.find((s: any) => s.serviceCode === svc.code);
            const isSaving = upsertMutation.isPending;

            return (
              <div key={svc.code} className={`border rounded-xl overflow-hidden transition-all ${isExpanded ? svc.borderColor : 'border-border'}`}>
                {/* Service header row */}
                <div
                  className={`flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? svc.bgColor : ''}`}
                  onClick={() => setExpandedService(isExpanded ? null : svc.code)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${svc.bgColor}`}>
                      <span className={`material-symbols-outlined text-lg ${svc.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        {svc.icon}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-sm">{svc.label}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {existing ? (
                          <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-full ${existing.isEnabled === 1 ? 'bg-[var(--st-green-bg)] text-[var(--st-green)]' : 'bg-muted text-muted-foreground'}`}>
                            {existing.isEnabled === 1 ? 'ON' : 'OFF'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Not configured</span>
                        )}
                        {existing?.baseRate && (
                          <span className="text-[10px] text-muted-foreground">AED {existing.baseRate}</span>
                        )}
                        {existing?.cutoffTime && (
                          <span className="text-[10px] text-muted-foreground">Cut-off {existing.cutoffTime}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`material-symbols-outlined text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>

                {/* Expanded settings */}
                {isExpanded && (
                  <div className="p-5 border-t border-border space-y-5 bg-card">
                    {/* Enable toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm">Service Status</p>
                        <p className="text-xs text-muted-foreground">Enable or disable this service for this client</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateDraft(svc.code, { isEnabled: !d.isEnabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${d.isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${d.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>

                    {/* Pricing */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={labelClass}>Base Rate (AED, 0–5 kg)</label>
                        <input
                          type="number" step="0.01" placeholder="e.g. 12.00"
                          value={d.baseRate}
                          onChange={e => updateDraft(svc.code, { baseRate: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>Per Extra Kg (AED)</label>
                        <input
                          type="number" step="0.01" placeholder="e.g. 1.50"
                          value={d.perKgRate}
                          onChange={e => updateDraft(svc.code, { perKgRate: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Cut-off */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={labelClass}>Cut-off Time (Dubai, HH:MM)</label>
                        <input
                          type="time"
                          value={d.cutoffTime}
                          onChange={e => updateDraft(svc.code, { cutoffTime: e.target.value })}
                          className={inputClass}
                        />
                        <p className="text-[10px] text-muted-foreground">After this time, service shows as unavailable</p>
                      </div>
                      {svc.hasWindow && (
                        <div className="space-y-1">
                          <label className={labelClass}>Delivery Window</label>
                          <input
                            type="text" placeholder="e.g. 6:00 PM – 11:00 PM"
                            value={d.deliveryWindow}
                            onChange={e => updateDraft(svc.code, { deliveryWindow: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                      )}
                    </div>

                    {/* Delivery time & display */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className={labelClass}>Delivery Time Label</label>
                        <input
                          type="text" placeholder="e.g. 1–2 business days"
                          value={d.deliveryTime}
                          onChange={e => updateDraft(svc.code, { deliveryTime: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>Display Name (optional)</label>
                        <input
                          type="text" placeholder="Override service name shown to client"
                          value={d.displayName}
                          onChange={e => updateDraft(svc.code, { displayName: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <label className={labelClass}>Description (shown to client)</label>
                      <textarea
                        rows={2} placeholder="Short description visible in the service selection screen"
                        value={d.description}
                        onChange={e => updateDraft(svc.code, { description: e.target.value })}
                        className={inputClass}
                      />
                    </div>

                    {/* Available Regions */}
                    <div className="space-y-2">
                      <label className={labelClass}>Available Regions</label>
                      <div className="flex flex-wrap gap-2">
                        {UAE_REGIONS.map(region => (
                          <button
                            key={region}
                            type="button"
                            onClick={() => toggleRegion(svc.code, region)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                              d.availableRegions.includes(region)
                                ? `${svc.bgColor} ${svc.borderColor} ${svc.color}`
                                : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {region}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* PREFERRED_TIME extra config */}
                    {svc.hasExtraConfig && (
                      <div className="space-y-4 p-4 bg-secondary border border-border rounded-lg">
                        <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.12em]">Preferred Time Configuration</p>
                        <div className="space-y-1">
                          <label className={labelClass}>Available Time Slots (comma-separated)</label>
                          <input
                            type="text"
                            placeholder="e.g. 09:00 - 11:00, 14:00 - 16:00, 18:00 - 20:00"
                            value={d.timeSlots}
                            onChange={e => updateDraft(svc.code, { timeSlots: e.target.value })}
                            className={inputClass}
                          />
                          <p className="text-[10px] text-muted-foreground">Leave empty to use the default hourly windows (06:00–22:00). Customers always book by window, never an exact minute.</p>
                        </div>
                        <div className="space-y-1">
                          <label className={labelClass}>Blackout Dates (comma-separated, YYYY-MM-DD)</label>
                          <input
                            type="text"
                            placeholder="e.g. 2025-12-25, 2026-01-01"
                            value={d.blackoutDates}
                            onChange={e => updateDraft(svc.code, { blackoutDates: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    )}

                    {/* Save button */}
                    <div className="flex justify-end pt-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => handleSave(svc.code)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">save</span>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
