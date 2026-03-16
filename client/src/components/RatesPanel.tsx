import { useState } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, MapPin, Package, Pencil, Save, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

type ZoneDraft = {
  zone1BaseRate: string;
  zone1PerKg: string;
  zone2BaseRate: string;
  zone2PerKg: string;
  zone3BaseRate: string;
  zone3PerKg: string;
  sddBaseRate: string;
  sddPerKg: string;
};

const ZONE_MAP = {
  'Zone 1': ['Dubai', 'Sharjah', 'Ajman', 'Abu Dhabi'],
  'Zone 2': ['Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  'Zone 3': ['Remote areas', '(Al Ain, Liwa, Ruwais,', 'RAK remote, etc.)'],
};

export default function RatesPanel() {
  const { token } = usePortalAuth();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ZoneDraft>({
    zone1BaseRate: '', zone1PerKg: '',
    zone2BaseRate: '', zone2PerKg: '',
    zone3BaseRate: '', zone3PerKg: '',
    sddBaseRate: '', sddPerKg: '',
  });

  const { data: clients, isLoading, refetch } = trpc.portal.clients.getWithTiers.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const updateMutation = trpc.portal.clients.updateZoneRates.useMutation({
    onSuccess: () => {
      toast.success('Zone rates saved successfully.');
      setEditingId(null);
      refetch();
    },
    onError: () => {
      toast.error('Failed to save rates.');
    },
  });

  function startEdit(client: any) {
    setEditingId(client.id);
    setDraft({
      zone1BaseRate: client.zone1BaseRate       ?? '',
      zone1PerKg:    client.zone1PerKg          ?? '',
      zone2BaseRate: client.zone2BaseRate       ?? '',
      zone2PerKg:    client.zone2PerKg          ?? '',
      zone3BaseRate: client.zone3BaseRate       ?? '',
      zone3PerKg:    client.zone3PerKg          ?? '',
      sddBaseRate:   client.customSddBaseRate   ?? '',
      sddPerKg:      client.customSddPerKg      ?? '',
    });
  }

  function saveEdit(clientId: number) {
    updateMutation.mutate({
      token: token || '',
      clientId,
      zone1BaseRate: draft.zone1BaseRate || undefined,
      zone1PerKg:    draft.zone1PerKg    || undefined,
      zone2BaseRate: draft.zone2BaseRate || undefined,
      zone2PerKg:    draft.zone2PerKg    || undefined,
      zone3BaseRate: draft.zone3BaseRate || undefined,
      zone3PerKg:    draft.zone3PerKg    || undefined,
      sddBaseRate:   draft.sddBaseRate   || undefined,
      sddPerKg:      draft.sddPerKg      || undefined,
    });
  }

  function formatRate(base: string | null, perKg: string | null) {
    if (!base) return <span className="text-muted-foreground">—</span>;
    return (
      <span>
        <span className="text-green-400 font-semibold">{base} AED</span>
        {perKg && <span className="text-muted-foreground text-xs ml-1">+{perKg}/kg</span>}
      </span>
    );
  }

  return (
    <div className="space-y-6">

      {/* Zone Map */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-lg">Delivery Zones — UAE</CardTitle>
          </div>
          <CardDescription>Zone classification by emirate/area</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(ZONE_MAP).map(([zone, areas], idx) => (
              <div key={zone} className={`p-3 rounded-lg border ${idx === 0 ? 'border-green-500/30 bg-green-500/5' : idx === 1 ? 'border-orange-500/30 bg-orange-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                <p className={`font-semibold text-sm mb-2 ${idx === 0 ? 'text-green-400' : idx === 1 ? 'text-orange-400' : 'text-red-400'}`}>{zone}</p>
                {areas.map(a => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Client Zone Rates Table */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            <CardTitle className="text-lg">Client Rates</CardTitle>
          </div>
          <CardDescription>
            Base rate covers 0–5 kg. Additional per-kg charge applies above 5 kg. SDD applies Zone 1 only (Dubai / Sharjah / Ajman / Abu Dhabi).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Client</TableHead>
                    <TableHead>
                      <span className="text-green-400">DOM Zone 1</span>
                      <span className="text-muted-foreground text-xs block font-normal">Dubai / Sharjah / Ajman / AD</span>
                    </TableHead>
                    <TableHead>
                      <span className="text-orange-400">DOM Zone 2</span>
                      <span className="text-muted-foreground text-xs block font-normal">UAQ / RAK / Fujairah</span>
                    </TableHead>
                    <TableHead>
                      <span className="text-red-400">DOM Zone 3</span>
                      <span className="text-muted-foreground text-xs block font-normal">Remote areas</span>
                    </TableHead>
                    <TableHead>
                      <span className="text-purple-400">SDD</span>
                      <span className="text-muted-foreground text-xs block font-normal">Zone 1 only</span>
                    </TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(clients || []).map((client: any) => {
                    const isEditing = editingId === client.id;
                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <p className="font-medium text-sm">{client.companyName}</p>
                          <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="text-[10px] h-4 mt-1">
                            {client.status}
                          </Badge>
                        </TableCell>

                        {/* Zone 1 */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone1BaseRate} onChange={e => setDraft(d => ({ ...d, zone1BaseRate: e.target.value }))} />
                              <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone1PerKg} onChange={e => setDraft(d => ({ ...d, zone1PerKg: e.target.value }))} />
                            </div>
                          ) : formatRate(client.zone1BaseRate, client.zone1PerKg)}
                        </TableCell>

                        {/* Zone 2 */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone2BaseRate} onChange={e => setDraft(d => ({ ...d, zone2BaseRate: e.target.value }))} />
                              <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone2PerKg} onChange={e => setDraft(d => ({ ...d, zone2PerKg: e.target.value }))} />
                            </div>
                          ) : formatRate(client.zone2BaseRate, client.zone2PerKg)}
                        </TableCell>

                        {/* Zone 3 */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.zone3BaseRate} onChange={e => setDraft(d => ({ ...d, zone3BaseRate: e.target.value }))} />
                              <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.zone3PerKg} onChange={e => setDraft(d => ({ ...d, zone3PerKg: e.target.value }))} />
                            </div>
                          ) : formatRate(client.zone3BaseRate, client.zone3PerKg)}
                        </TableCell>

                        {/* SDD */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Input className="h-7 w-16 text-xs" placeholder="Base" value={draft.sddBaseRate} onChange={e => setDraft(d => ({ ...d, sddBaseRate: e.target.value }))} />
                              <Input className="h-7 w-14 text-xs" placeholder="+/kg" value={draft.sddPerKg} onChange={e => setDraft(d => ({ ...d, sddPerKg: e.target.value }))} />
                            </div>
                          ) : formatRate(client.customSddBaseRate, client.customSddPerKg)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="default" className="h-7 px-2" onClick={() => saveEdit(client.id)} disabled={updateMutation.isPending}>
                                <Save className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-primary" onClick={() => startEdit(client)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* COD Configuration */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Cash on Delivery (COD) Configuration
          </CardTitle>
          <CardDescription>
            COD fee structure for both DOM and SDD services
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">COD Fee Percentage</p>
                <p className="text-sm text-muted-foreground">Applied to collected amount</p>
              </div>
              <span className="text-2xl font-bold text-green-400">3.3%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">Minimum COD Fee</p>
                <p className="text-sm text-muted-foreground">Minimum charge regardless of amount</p>
              </div>
              <span className="text-2xl font-bold text-green-400">2.00 AED</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div>
                <p className="font-medium">Maximum COD Amount</p>
                <p className="text-sm text-muted-foreground">Per shipment limit</p>
              </div>
              <span className="text-2xl font-bold text-green-400">3,000 AED</span>
            </div>
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <p className="text-sm text-blue-200">
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
