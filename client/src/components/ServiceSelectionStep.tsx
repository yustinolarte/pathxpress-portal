import React, { useEffect } from 'react';
import { trpc } from '@/lib/trpc';

// Minimum lead time (in hours) for Same Day Preferred Time deliveries.
const SAME_DAY_LEAD_HOURS = 4;

export interface ServiceOption {
  code: string;
  available: boolean;
  reason: string | null;
  displayName: string;
  description: string | null;
  deliveryWindow: string | null;
  deliveryTime: string | null;
  price: number | null;
  cutoffTime: string | null;
  extraConfig: { timeSlots?: string[]; blackoutDates?: string[] } | null;
}

interface Props {
  emirate: string;
  weight: number;
  selectedService: string;
  onServiceSelect: (code: string) => void;
  preferredDate: string;
  preferredTime: string;
  onPreferredDateChange: (d: string) => void;
  onPreferredTimeChange: (t: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  codRequired: number;
  codAmount: string;
  calculatedCODFee: number;
  fitOnDelivery: number;
  fodFee: number;
  shipperName?: string;
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getToday(): string {
  return toLocalDateStr(new Date());
}

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalDateStr(d);
}

// Earliest selectable time (HH:MM) for a same-day delivery: now + lead time.
function earliestSameDayTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + SAME_DAY_LEAD_HOURS);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Preferred Time is always booked by window. When an admin hasn't configured
// custom slots the server still returns these hourly windows (08:00–22:00),
// but we keep a client default as a defensive fallback.
const DEFAULT_PREFERRED_SLOTS: string[] = Array.from({ length: 14 }, (_, i) => {
  const start = String(8 + i).padStart(2, '0');
  const end = String(9 + i).padStart(2, '0');
  return `${start}:00 - ${end}:00`;
});

// A slot may be a window ("06:00 - 07:00") or a single time ("18:00"); the
// same-day lead-time check compares against the window's start.
function slotStartTime(slot: string): string {
  return slot.split(/[-–—]/)[0].trim();
}

// True if the given slot respects the same-day lead time when the date is today.
function isSameDayTimeAllowed(date: string, slot: string): boolean {
  if (!slot) return false;
  if (date !== getToday()) return true; // only today is constrained
  const min = new Date();
  min.setHours(min.getHours() + SAME_DAY_LEAD_HOURS, min.getMinutes(), 0, 0);
  const [h, m] = slotStartTime(slot).split(':').map(Number);
  const sel = new Date();
  sel.setHours(h, m ?? 0, 0, 0);
  return sel.getTime() >= min.getTime();
}

export default function ServiceSelectionStep({
  emirate,
  weight,
  selectedService,
  onServiceSelect,
  preferredDate,
  preferredTime,
  onPreferredDateChange,
  onPreferredTimeChange,
  onConfirm,
  onBack,
  isSubmitting,
  codRequired,
  codAmount,
  calculatedCODFee,
  fitOnDelivery,
  fodFee,
  shipperName,
}: Props) {
  const { data: services, isLoading, error } = trpc.portal.services.getAvailable.useQuery(
    { emirate, weight },
    { enabled: !!emirate && weight > 0 }
  );

  const selected = services?.find(s => s.code === selectedService);
  const isSameDayPreferred = selectedService === 'PREFERRED_TIME_SDD';
  const isPreferred = selectedService === 'PREFERRED_TIME' || isSameDayPreferred;
  const minDate = isSameDayPreferred ? getToday() : getTomorrow();

  // Preferred Time is always booked by window — use the admin-configured slots
  // when present, otherwise the hourly defaults.
  const timeSlots = selected?.extraConfig?.timeSlots && selected.extraConfig.timeSlots.length > 0
    ? selected.extraConfig.timeSlots
    : DEFAULT_PREFERRED_SLOTS;

  // Keep the preferred date consistent with the selected service.
  // Same-day is locked to today; next-day clears any out-of-range date.
  useEffect(() => {
    if (!isPreferred) return;
    if (isSameDayPreferred) {
      if (preferredDate !== getToday()) onPreferredDateChange(getToday());
    } else if (preferredDate && preferredDate < getTomorrow()) {
      onPreferredDateChange('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedService]);

  const preferredTimeValid = isPreferred && Boolean(preferredDate) && Boolean(preferredTime) &&
    (!isSameDayPreferred || isSameDayTimeAllowed(preferredDate, preferredTime));

  const canConfirm = selectedService &&
    (!isPreferred || preferredTimeValid) &&
    !isSubmitting;

  const codAmountNum = parseFloat(codAmount) || 0;
  const estTotal = selected && selected.price !== null
    ? selected.price + calculatedCODFee + (fitOnDelivery === 1 ? fodFee : 0)
    : 0;

  return (
    <div className="svc-step-lg animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col flex-1">

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-[13px] text-muted-foreground font-mono">Loading services…</span>
        </div>
      )}

      {error && (
        <div className="alert-soft red">
          <span className="txt">Failed to load services. Please go back and try again.</span>
        </div>
      )}

      {/* Two-column: services (left) · summary (right) */}
      {services && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_.9fr] gap-6 items-start flex-1 content-start">

          {/* LEFT — service selection */}
          <div className="space-y-[18px]">
            <div className="sec">
              <div className="sec-bar">
                <span className="sic">
                  <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </span>
                <h4>Select your service</h4>
              </div>
              <div className="sec-in flex flex-col gap-2.5">
                {services.map((svc) => {
                  const isSelected = selectedService === svc.code;
                  return (
                    <div
                      key={svc.code}
                      onClick={() => svc.available && onServiceSelect(svc.code)}
                      className={[
                        'svc-card',
                        isSelected ? 'sel' : '',
                        svc.available ? '' : 'opacity-40 cursor-not-allowed pointer-events-none',
                      ].join(' ')}
                    >
                      <div className="radio" />
                      <div className="info min-w-0">
                        <div className="t flex items-center gap-2 flex-wrap">
                          {svc.displayName}
                          {!svc.available && svc.reason && (
                            <span className="badge2 b-red">{svc.reason}</span>
                          )}
                        </div>
                        <div className="s flex flex-wrap gap-x-3 gap-y-0.5">
                          {svc.deliveryTime && <span>{svc.deliveryTime}</span>}
                          {svc.deliveryWindow && <span>Window {svc.deliveryWindow}</span>}
                          {svc.cutoffTime && <span>Cut-off {svc.cutoffTime}</span>}
                          {!svc.deliveryTime && !svc.deliveryWindow && svc.description && <span>{svc.description}</span>}
                        </div>
                      </div>
                      {svc.available && svc.price !== null && (
                        <div className="rate">AED {svc.price.toFixed(2)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preferred date & time — shown when scheduled service selected */}
            {isPreferred && selected && (
              <div className="sec animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="sec-bar">
                  <span className="sic">
                    <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                  </span>
                  <h4>Preferred date &amp; window</h4>
                </div>
                <div className="sec-in">
                  <div className="fgrid">
                    <div className="ff">
                      <label>Delivery date <span className="req">*</span></label>
                      <input
                        type="date"
                        min={minDate}
                        max={isSameDayPreferred ? getToday() : undefined}
                        value={preferredDate}
                        onChange={e => onPreferredDateChange(e.target.value)}
                        className="finp"
                      />
                    </div>
                    <div className="ff">
                      <label>Time window <span className="req">*</span></label>
                      <select
                        value={preferredTime}
                        onChange={e => onPreferredTimeChange(e.target.value)}
                        className="fsel"
                      >
                        <option value="">Select time window</option>
                        {timeSlots.map((slot: string) => {
                          const disabled = isSameDayPreferred && !isSameDayTimeAllowed(preferredDate || getToday(), slot);
                          return (
                            <option key={slot} value={slot} disabled={disabled}>
                              {slot}{disabled ? ' — too soon' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                  {isSameDayPreferred && (
                    <p className="font-mono text-[10px] text-muted-foreground mt-2">
                      Same-day deliveries require at least {SAME_DAY_LEAD_HOURS} hours' notice — earliest today is {earliestSameDayTime()}.
                    </p>
                  )}
                  {(!preferredDate || !preferredTime) ? (
                    <p className="font-mono text-[10px] text-muted-foreground mt-2">Select both date and window to continue.</p>
                  ) : isSameDayPreferred && !isSameDayTimeAllowed(preferredDate, preferredTime) && (
                    <p className="font-mono text-[10px] text-[var(--st-red,#dc2626)] mt-2">That window is within the next {SAME_DAY_LEAD_HOURS} hours — please pick a later time.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — order summary + confirm note */}
          <div className="space-y-3.5">
            <div className="sumcard">
              <span className="ghost">X</span>
              <div className="font-mono text-[10px] tracking-[0.12em] uppercase mb-3"
                style={{ color: 'color-mix(in srgb, var(--band-ink) 55%, transparent)' }}>
                Order summary
              </div>
              {shipperName && (
                <div className="sr"><span>Sender</span><span className="sv text-[12px]">{shipperName}</span></div>
              )}
              <div className="sr"><span>Service</span><span className="sv">{selected?.displayName ?? '—'}</span></div>
              <div className="sr"><span>Weight</span><span className="sv">{weight} kg</span></div>
              <div className="sr"><span>Destination</span><span className="sv text-[12px]">{emirate}</span></div>
              {codRequired === 1 && codAmountNum > 0 && (
                <div className="sr"><span>COD</span><span className="sv">AED {codAmountNum.toFixed(2)}</span></div>
              )}
              <div className="sr div"><span>Base shipping</span><span className="sv">{selected?.price != null ? `AED ${selected.price.toFixed(2)}` : 'AED —'}</span></div>
              {calculatedCODFee > 0 && (
                <div className="sr"><span>COD fee</span><span className="sv">AED {calculatedCODFee.toFixed(2)}</span></div>
              )}
              {fitOnDelivery === 1 && (
                <div className="sr"><span>Fit on Delivery</span><span className="sv">AED {fodFee.toFixed(2)}</span></div>
              )}
              {isPreferred && preferredDate && preferredTime && (
                <div className="sr"><span>Scheduled</span><span className="sv text-[11px]">{preferredDate} · {preferredTime}</span></div>
              )}
              <div className="sr div total">
                <span>Total</span>
                <span className="sv">{selected?.price != null ? `AED ${estTotal.toFixed(2)}` : 'AED —'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-3 rounded-[10px] text-[13px]"
              style={{
                border: '1px solid color-mix(in srgb, var(--st-green) 30%, transparent)',
                background: 'var(--st-green-bg)',
                color: 'var(--foreground)',
              }}>
              <span className="material-symbols-outlined text-[18px]" style={{ color: 'var(--st-green)' }}>check_circle</span>
              Your label is generated automatically on confirmation.
            </div>
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-3 pt-5 mt-6 border-t border-border">
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="btn-pill btn-pill--ghost btn-pill--sm"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="btn-pill btn-pill--primary btn-pill--sm"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
              Processing…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-base">check</span>
              Confirm order
            </>
          )}
        </button>
      </div>
    </div>
  );
}
