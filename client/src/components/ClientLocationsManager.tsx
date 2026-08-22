import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { MapPin, Star, Pencil, Trash2, Plus, X } from 'lucide-react';
import { LocationPicker, type PickedLocation } from '@/components/LocationPicker';
import { UAE_CITIES, PHONE_PREFIXES, normalizePhone, isPlausiblePhone, splitPhone } from '@shared/uae';

export interface ClientLocation {
    id: number;
    nickname: string;
    shipperName: string;
    shipperAddress: string;
    shipperCity: string;
    shipperCountry: string;
    shipperPhone: string;
    latitude?: string | null;
    longitude?: string | null;
    isDefault: number;
}

export interface LocationFormValues {
    nickname: string;
    shipperName: string;
    shipperAddress: string;
    shipperCity: string;
    shipperCountry: string;
    shipperPhone: string;
    latitude?: string;
    longitude?: string;
}

interface ClientLocationsManagerProps {
    locations: ClientLocation[];
    isLoading: boolean;
    /** undefined = no cap (admin can add as many as a client needs). */
    maxLocations?: number;
    onCreate: (values: LocationFormValues) => Promise<void>;
    onUpdate: (id: number, values: LocationFormValues) => Promise<void>;
    onSetDefault: (id: number) => Promise<void>;
    onDelete: (id: number) => Promise<void>;
    /** Short copy shown above the list — differs slightly for admin vs client portal. */
    helperText: string;
}

const inputClass =
    'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/40';
const labelClass = 'text-xs font-bold text-muted-foreground uppercase tracking-wider';

const emptyForm = {
    nickname: '',
    shipperName: '',
    phonePrefix: '+971',
    phoneNational: '',
    shipperAddress: '',
    shipperCity: 'Dubai',
    shipperCountry: 'UAE',
};

export default function ClientLocationsManager({
    locations,
    isLoading,
    maxLocations,
    onCreate,
    onUpdate,
    onSetDefault,
    onDelete,
    helperText,
}: ClientLocationsManagerProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [pickedLocation, setPickedLocation] = useState<PickedLocation | null>(null);
    const [resetSignal, setResetSignal] = useState(0);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);

    const atCap = maxLocations !== undefined && locations.length >= maxLocations;

    function openCreateForm() {
        setEditingId(null);
        setForm(emptyForm);
        setPickedLocation(null);
        setResetSignal(n => n + 1);
        setFormOpen(true);
    }

    function openEditForm(loc: ClientLocation) {
        const { prefix, national } = splitPhone(loc.shipperPhone);
        setEditingId(loc.id);
        setForm({
            nickname: loc.nickname,
            shipperName: loc.shipperName,
            phonePrefix: prefix,
            phoneNational: national,
            shipperAddress: loc.shipperAddress,
            shipperCity: loc.shipperCity,
            shipperCountry: loc.shipperCountry || 'UAE',
        });
        setPickedLocation(
            loc.latitude && loc.longitude ? { latitude: loc.latitude, longitude: loc.longitude } : null
        );
        setResetSignal(n => n + 1);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setEditingId(null);
    }

    const phoneLooksWrong = form.phoneNational.trim().length > 0 && !isPlausiblePhone(form.phonePrefix, form.phoneNational);

    async function handleSave() {
        if (!form.nickname.trim()) return toast.error('Give this location a name (e.g. "Main Warehouse")');
        if (!form.shipperName.trim()) return toast.error('Enter a contact name');
        if (!form.phoneNational.trim()) return toast.error('Enter a phone number');
        if (phoneLooksWrong) return toast.error('That phone number does not look valid');
        if (!form.shipperAddress.trim()) return toast.error('Enter an address');
        if (!pickedLocation) return toast.error('Drop a pin on the map to confirm the exact location');

        const values: LocationFormValues = {
            nickname: form.nickname.trim(),
            shipperName: form.shipperName.trim(),
            shipperAddress: form.shipperAddress.trim(),
            shipperCity: form.shipperCity,
            shipperCountry: form.shipperCountry,
            shipperPhone: normalizePhone(form.phonePrefix, form.phoneNational),
            latitude: pickedLocation.latitude,
            longitude: pickedLocation.longitude,
        };

        setSaving(true);
        try {
            if (editingId) {
                await onUpdate(editingId, values);
                toast.success('Location updated');
            } else {
                await onCreate(values);
                toast.success('Location saved');
            }
            closeForm();
        } catch (e: any) {
            toast.error(e?.message || 'Failed to save location');
        } finally {
            setSaving(false);
        }
    }

    async function handleSetDefault(id: number) {
        setBusyId(id);
        try {
            await onSetDefault(id);
        } catch (e: any) {
            toast.error(e?.message || 'Failed to set default');
        } finally {
            setBusyId(null);
        }
    }

    async function handleDelete(loc: ClientLocation) {
        if (!confirm(`Delete "${loc.nickname}"?${loc.isDefault ? ' Another location will become the new default automatically.' : ''}`)) return;
        setBusyId(loc.id);
        try {
            await onDelete(loc.id);
            toast.success('Location deleted');
        } catch (e: any) {
            toast.error(e?.message || 'Failed to delete location');
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <p className="text-sm text-muted-foreground max-w-2xl">{helperText}</p>
                {!formOpen && (
                    <Button size="sm" onClick={openCreateForm} disabled={atCap} className="shrink-0">
                        <Plus className="w-4 h-4 mr-1" /> Add location
                    </Button>
                )}
            </div>

            {atCap && !formOpen && (
                <p className="text-xs text-muted-foreground">
                    You've reached the limit of {maxLocations} saved locations. Delete one to add another.
                </p>
            )}

            {formOpen && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-sm">{editingId ? 'Edit location' : 'New location'}</h4>
                        <button type="button" onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className={labelClass}>Location name *</label>
                            <input className={inputClass} value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} placeholder="Main Warehouse, Downtown Shop..." />
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>Contact name *</label>
                            <input className={inputClass} value={form.shipperName} onChange={e => setForm({ ...form, shipperName: e.target.value })} placeholder="Company or person" />
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>Phone *</label>
                            <div className="flex">
                                <select
                                    className="px-2 rounded-l-lg border border-r-0 border-input bg-muted text-foreground text-sm font-medium focus:outline-none"
                                    value={form.phonePrefix}
                                    onChange={e => setForm({ ...form, phonePrefix: e.target.value })}
                                >
                                    {PHONE_PREFIXES.map(p => (
                                        <option key={p.code} value={p.code}>{p.flag} {p.code}</option>
                                    ))}
                                </select>
                                <input
                                    className={`${inputClass} rounded-l-none ${phoneLooksWrong ? 'border-destructive' : ''}`}
                                    value={form.phoneNational}
                                    onChange={e => setForm({ ...form, phoneNational: e.target.value })}
                                    placeholder="5x xxx xxxx"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className={labelClass}>City</label>
                            <select className={inputClass} value={form.shipperCity} onChange={e => setForm({ ...form, shipperCity: e.target.value })}>
                                {UAE_CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <label className={labelClass}>Address *</label>
                            <input className={inputClass} value={form.shipperAddress} onChange={e => setForm({ ...form, shipperAddress: e.target.value })} placeholder="Building, street, area" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className={labelClass}>Pin the exact location *</label>
                        <LocationPicker
                            onLocationPicked={setPickedLocation}
                            biasEmirate={form.shipperCity}
                            initialLocation={pickedLocation ? { lat: parseFloat(pickedLocation.latitude), lng: parseFloat(pickedLocation.longitude) } : undefined}
                            resetSignal={resetSignal}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={closeForm}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : editingId ? 'Save changes' : 'Save location'}
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading locations...</p>
            ) : locations.length === 0 && !formOpen ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No saved locations yet. Add one to auto-fill it on every new shipment.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {locations.map(loc => (
                        <div key={loc.id} className={`rounded-xl border p-4 space-y-2 ${loc.isDefault ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-1.5 font-semibold text-sm">
                                    {loc.isDefault ? <Star className="w-3.5 h-3.5 text-primary fill-primary" /> : <MapPin className="w-3.5 h-3.5 text-muted-foreground" />}
                                    {loc.nickname}
                                </div>
                                {loc.isDefault && <span className="badge2 b-green shrink-0">Default</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">{loc.shipperName} · {loc.shipperPhone}</p>
                            <p className="text-xs text-muted-foreground">{loc.shipperAddress}, {loc.shipperCity}</p>
                            {!loc.latitude && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400">No exact pin — edit to add one</p>
                            )}
                            <div className="flex items-center gap-3 pt-1">
                                {!loc.isDefault && (
                                    <button
                                        type="button"
                                        onClick={() => handleSetDefault(loc.id)}
                                        disabled={busyId === loc.id}
                                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                                    >
                                        Set as default
                                    </button>
                                )}
                                <button type="button" onClick={() => openEditForm(loc)} className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                                    <Pencil className="w-3 h-3" /> Edit
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(loc)}
                                    disabled={busyId === loc.id}
                                    className="text-xs font-medium text-destructive hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
