import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Check, Building2, MapPin, Zap, KeyRound, ChevronRight, ChevronLeft, Loader2, Rocket, Shirt, Globe, DollarSign } from 'lucide-react';

interface CreateClientWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const defaultForm = {
  companyName: '',
  contactName: '',
  billingEmail: '',
  phone: '',
  billingAddress: '',
  city: '',
  country: 'UAE',
  creditTerms: '',
  codAllowed: false,
  codFeePercent: '',
  codMinFee: '',
  codMaxFee: '',
  bulletAllowed: false,
  customBulletBaseRate: '',
  customBulletPerKg: '',
  fodAllowed: false,
  fodFee: '',
  intlAllowed: false,
  intlDiscountPercent: '',
  portalEmail: '',
  portalPassword: '',
};

const STEPS = [
  { id: 1, label: 'Empresa', icon: Building2 },
  { id: 2, label: 'Dirección', icon: MapPin },
  { id: 3, label: 'Servicios', icon: Zap },
  { id: 4, label: 'Portal', icon: KeyRound },
];

// ─── Componentes auxiliares fuera del componente principal ─────────────────
// (evita que React los desmonte/remonte en cada re-render y pierda el foco)

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

function ServiceToggle({
  enabled,
  onToggle,
  icon: Icon,
  label,
  colorClass,
  children,
}: {
  enabled: boolean;
  onToggle: () => void;
  icon: React.ElementType;
  label: string;
  colorClass: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-colors ${enabled ? colorClass : 'border-border bg-background'}`}>
      <label className="flex items-center justify-between p-4 cursor-pointer">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${enabled ? '' : 'text-muted-foreground'}`} />
          <span className={`font-bold text-sm uppercase tracking-wider ${enabled ? '' : 'text-muted-foreground'}`}>
            {label}
          </span>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="w-4 h-4 rounded accent-primary cursor-pointer"
        />
      </label>
      {enabled && children && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function CreateClientWizard({ open, onOpenChange, onSuccess }: CreateClientWizardProps) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaultForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createClientMutation = trpc.portal.admin.createClient.useMutation();
  const updateSettingsMutation = trpc.portal.clients.updateSettings.useMutation();
  const createUserMutation = trpc.portal.admin.createCustomerUser.useMutation();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setForm(defaultForm);
      setTouched({});
      setIsSubmitting(false);
    }
  }, [open]);

  function setField(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function touch(field: string) {
    setTouched(prev => ({ ...prev, [field]: true }));
  }

  function isEmailValid(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  const errors: Record<string, string> = {};
  if (touched.companyName && !form.companyName) errors.companyName = 'Requerido';
  if (touched.contactName && !form.contactName) errors.contactName = 'Requerido';
  if (touched.billingEmail && !form.billingEmail) errors.billingEmail = 'Requerido';
  else if (touched.billingEmail && !isEmailValid(form.billingEmail)) errors.billingEmail = 'Email inválido';
  if (touched.phone && !form.phone) errors.phone = 'Requerido';
  if (touched.billingAddress && !form.billingAddress) errors.billingAddress = 'Requerido';
  if (touched.city && !form.city) errors.city = 'Requerido';
  if (touched.codFeePercent && form.codAllowed && !form.codFeePercent) errors.codFeePercent = 'Requerido si COD activo';
  if (touched.portalPassword && form.portalEmail && form.portalPassword.length < 8) errors.portalPassword = 'Mínimo 8 caracteres';

  function canAdvance(): boolean {
    if (step === 1) return !!(form.companyName && form.contactName && isEmailValid(form.billingEmail) && form.phone);
    if (step === 2) return !!(form.billingAddress && form.city && form.country);
    if (step === 3) {
      if (form.codAllowed && !form.codFeePercent) return false;
      if (form.bulletAllowed && (!form.customBulletBaseRate || !form.customBulletPerKg)) return false;
      return true;
    }
    if (step === 4) {
      if (form.portalEmail && form.portalPassword.length < 8) return false;
      return true;
    }
    return true;
  }

  function touchAll() {
    if (step === 1) setTouched(t => ({ ...t, companyName: true, contactName: true, billingEmail: true, phone: true }));
    if (step === 2) setTouched(t => ({ ...t, billingAddress: true, city: true }));
    if (step === 3) setTouched(t => ({ ...t, codFeePercent: true }));
    if (step === 4) setTouched(t => ({ ...t, portalPassword: true }));
  }

  function handleNext() {
    touchAll();
    if (!canAdvance()) return;
    setStep(s => s + 1);
  }

  function handleBack() {
    setStep(s => s - 1);
  }

  async function handleCreate() {
    touchAll();
    if (!canAdvance()) return;
    setIsSubmitting(true);
    try {
      const client = await createClientMutation.mutateAsync({
        client: {
          companyName: form.companyName,
          contactName: form.contactName,
          billingEmail: form.billingEmail,
          phone: form.phone,
          billingAddress: form.billingAddress,
          city: form.city,
          country: form.country,
          creditTerms: form.creditTerms || undefined,
          defaultCurrency: 'AED',
          codAllowed: form.codAllowed,
          codFeePercent: form.codFeePercent || undefined,
          codMaxFee: form.codMaxFee || undefined,
          notes: undefined,
        },
      });

      const needsSettings = form.bulletAllowed || form.fodAllowed || form.intlAllowed || !!form.codMinFee;
      if (needsSettings) {
        await updateSettingsMutation.mutateAsync({
          clientId: client.id,
          codAllowed: form.codAllowed,
          codFeePercent: form.codFeePercent || undefined,
          codMinFee: form.codMinFee || undefined,
          codMaxFee: form.codMaxFee || undefined,
          fodAllowed: form.fodAllowed,
          fodFee: form.fodFee || undefined,
          bulletAllowed: form.bulletAllowed,
          customBulletBaseRate: form.customBulletBaseRate || undefined,
          customBulletPerKg: form.customBulletPerKg || undefined,
          intlAllowed: form.intlAllowed,
          intlDiscountPercent: form.intlDiscountPercent || undefined,
        });
      }

      if (form.portalEmail && form.portalPassword) {
        await createUserMutation.mutateAsync({
          clientId: client.id,
          email: form.portalEmail,
          password: form.portalPassword,
        });
      }

      toast.success('Cliente creado exitosamente');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Error al crear el cliente');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Helper para inputs de texto — función normal, no componente
  function textInputClass(field: string) {
    return `w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors ${errors[field] ? 'border-red-500' : 'border-input'}`;
  }

  // ─── Renders de cada paso (funciones normales, no componentes) ─────────────

  function renderStep1() {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Datos de la Empresa</span>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Nombre de la empresa" required error={errors.companyName}>
              <input
                type="text"
                value={form.companyName}
                onChange={e => setField('companyName', e.target.value)}
                onBlur={() => touch('companyName')}
                placeholder="Ej: Acme Logistics LLC"
                className={textInputClass('companyName')}
              />
            </Field>
            <Field label="Nombre del contacto" required error={errors.contactName}>
              <input
                type="text"
                value={form.contactName}
                onChange={e => setField('contactName', e.target.value)}
                onBlur={() => touch('contactName')}
                placeholder="Ej: Ahmed Al Mansoori"
                className={textInputClass('contactName')}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Email de facturación" required error={errors.billingEmail}>
              <input
                type="email"
                value={form.billingEmail}
                onChange={e => setField('billingEmail', e.target.value)}
                onBlur={() => touch('billingEmail')}
                placeholder="billing@empresa.com"
                className={textInputClass('billingEmail')}
              />
            </Field>
            <Field label="Teléfono" required error={errors.phone}>
              <input
                type="text"
                value={form.phone}
                onChange={e => setField('phone', e.target.value)}
                onBlur={() => touch('phone')}
                placeholder="+971 50 000 0000"
                className={textInputClass('phone')}
              />
            </Field>
          </div>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">Dirección y Facturación</span>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Dirección de facturación" required error={errors.billingAddress}>
            <input
              type="text"
              value={form.billingAddress}
              onChange={e => setField('billingAddress', e.target.value)}
              onBlur={() => touch('billingAddress')}
              placeholder="Ej: Office 402, Business Bay Tower"
              className={textInputClass('billingAddress')}
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Ciudad" required error={errors.city}>
              <input
                type="text"
                value={form.city}
                onChange={e => setField('city', e.target.value)}
                onBlur={() => touch('city')}
                placeholder="Ej: Dubai"
                className={textInputClass('city')}
              />
            </Field>
            <Field label="País">
              <select
                value={form.country}
                onChange={e => setField('country', e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              >
                <option value="UAE">United Arab Emirates</option>
                <option value="Saudi Arabia">Saudi Arabia</option>
                <option value="Qatar">Qatar</option>
                <option value="Kuwait">Kuwait</option>
                <option value="Bahrain">Bahrain</option>
                <option value="Oman">Oman</option>
              </select>
            </Field>
          </div>
          <Field label="Términos de crédito (opcional)">
            <input
              type="text"
              value={form.creditTerms}
              onChange={e => setField('creditTerms', e.target.value)}
              placeholder="Ej: Net 30"
              className={textInputClass('creditTerms')}
            />
          </Field>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-4">
        {/* COD */}
        <ServiceToggle
          enabled={form.codAllowed}
          onToggle={() => setField('codAllowed', !form.codAllowed)}
          icon={DollarSign}
          label="Cash on Delivery (COD)"
          colorClass="border-primary bg-primary/5"
        >
          <div className="grid grid-cols-3 gap-3 mt-2">
            <Field label="Fee %" required error={errors.codFeePercent}>
              <input
                type="text"
                value={form.codFeePercent}
                onChange={e => setField('codFeePercent', e.target.value)}
                onBlur={() => touch('codFeePercent')}
                placeholder="3.3"
                className={textInputClass('codFeePercent')}
              />
            </Field>
            <Field label="Min Fee (AED)">
              <input
                type="text"
                value={form.codMinFee}
                onChange={e => setField('codMinFee', e.target.value)}
                placeholder="8.00"
                className={textInputClass('codMinFee')}
              />
            </Field>
            <Field label="Cap Fee (AED)">
              <input
                type="text"
                value={form.codMaxFee}
                onChange={e => setField('codMaxFee', e.target.value)}
                placeholder="50.00"
                className={textInputClass('codMaxFee')}
              />
            </Field>
          </div>
        </ServiceToggle>

        {/* Bullet */}
        <ServiceToggle
          enabled={form.bulletAllowed}
          onToggle={() => setField('bulletAllowed', !form.bulletAllowed)}
          icon={Rocket}
          label="Bullet 4H"
          colorClass="border-red-500 bg-red-500/5 text-red-500"
        >
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Base (5kg)" required>
              <input
                type="text"
                value={form.customBulletBaseRate}
                onChange={e => setField('customBulletBaseRate', e.target.value)}
                placeholder="50.00"
                className={textInputClass('customBulletBaseRate')}
              />
            </Field>
            <Field label="Extra kg" required>
              <input
                type="text"
                value={form.customBulletPerKg}
                onChange={e => setField('customBulletPerKg', e.target.value)}
                placeholder="5.00"
                className={textInputClass('customBulletPerKg')}
              />
            </Field>
          </div>
        </ServiceToggle>

        {/* FOD */}
        <ServiceToggle
          enabled={form.fodAllowed}
          onToggle={() => setField('fodAllowed', !form.fodAllowed)}
          icon={Shirt}
          label="Fit on Delivery (FOD)"
          colorClass="border-blue-500 bg-blue-500/5 text-blue-500"
        >
          <div className="mt-2 max-w-[200px]">
            <Field label="Fee (AED)">
              <input
                type="text"
                value={form.fodFee}
                onChange={e => setField('fodFee', e.target.value)}
                placeholder="5.00"
                className={textInputClass('fodFee')}
              />
            </Field>
          </div>
        </ServiceToggle>

        {/* Internacional */}
        <ServiceToggle
          enabled={form.intlAllowed}
          onToggle={() => setField('intlAllowed', !form.intlAllowed)}
          icon={Globe}
          label="Envíos Internacionales"
          colorClass="border-indigo-500 bg-indigo-500/5 text-indigo-500"
        >
          <div className="mt-2 max-w-[200px]">
            <Field label="Descuento (%)">
              <input
                type="text"
                value={form.intlDiscountPercent}
                onChange={e => setField('intlDiscountPercent', e.target.value)}
                placeholder="10"
                className={textInputClass('intlDiscountPercent')}
              />
            </Field>
          </div>
        </ServiceToggle>
      </div>
    );
  }

  function renderStep4() {
    const hasValidLogin = form.portalEmail && form.portalPassword.length >= 8;
    return (
      <div className="space-y-6">
        {/* Resumen */}
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-green-400" /> Resumen del cliente
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Empresa</span>
              <span className="font-semibold">{form.companyName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Contacto</span>
              <span>{form.contactName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Email</span>
              <span>{form.billingEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Ciudad</span>
              <span>{form.city}, {form.country}</span>
            </div>
            {(form.codAllowed || form.bulletAllowed || form.fodAllowed || form.intlAllowed) && (
              <div className="pt-2 border-t border-white/10 flex flex-wrap gap-2">
                {form.codAllowed && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">COD</span>}
                {form.bulletAllowed && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-semibold">Bullet 4H</span>}
                {form.fodAllowed && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold">FOD</span>}
                {form.intlAllowed && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold">Internacional</span>}
              </div>
            )}
          </div>
        </div>

        {/* Credenciales del portal */}
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 bg-muted/30 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">Acceso al Portal</span>
            </div>
            <span className="text-xs text-muted-foreground">Opcional</span>
          </div>
          <div className="p-6 space-y-5">
            <p className="text-xs text-muted-foreground">
              Crea credenciales para que el cliente acceda al portal. Puedes omitir este paso y crearlo después.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Email de acceso" error={errors.portalEmail}>
                <input
                  type="email"
                  value={form.portalEmail}
                  onChange={e => setField('portalEmail', e.target.value)}
                  onBlur={() => touch('portalEmail')}
                  placeholder="cliente@empresa.com"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                />
              </Field>
              <Field label="Contraseña" error={errors.portalPassword}>
                <input
                  type="password"
                  value={form.portalPassword}
                  onChange={e => setField('portalPassword', e.target.value)}
                  onBlur={() => touch('portalPassword')}
                  placeholder="Mínimo 8 caracteres"
                  className={`w-full rounded-lg border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors ${errors.portalPassword ? 'border-red-500' : 'border-input'}`}
                />
              </Field>
            </div>
            {hasValidLogin && (
              <div className="flex items-center gap-2 text-xs text-green-500 animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>Se creará un acceso al portal para este cliente</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong !w-[95vw] !max-w-[780px] max-h-[95vh] overflow-y-auto p-0 gap-0 border-white/10">
        <div className="w-full h-1 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0" />

        <div className="p-6 pb-0">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Building2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Nuevo Cliente</h2>
              <p className="text-xs text-muted-foreground">Completa los pasos para crear la cuenta del cliente</p>
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
        <div className="px-6 pb-6">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}

          {/* Navegación */}
          <div className={`flex gap-3 mt-6 ${step > 1 ? 'flex-row' : 'flex-row-reverse'}`}>
            {step === 4 ? (
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !canAdvance()}
                className="flex-1 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Creando...</>
                ) : (
                  <><Building2 className="w-5 h-5" /> Crear Cliente</>
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
