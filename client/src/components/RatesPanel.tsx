import { useState } from 'react';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Package, Truck } from 'lucide-react';

export default function RatesPanel() {
  const { token } = usePortalAuth();

  // Fetch rate tiers
  const { data: rateTiers, isLoading } = trpc.portal.rates.getTiers.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  // Fetch clients to show assignments
  const { data: clients } = trpc.portal.clients.getWithTiers.useQuery(
    { token: token || '' },
    { enabled: !!token }
  );

  const domTiers = rateTiers?.filter(t => t.serviceType === 'DOM') || [];
  const sddTiers = rateTiers?.filter(t => t.serviceType === 'SDD') || [];

  return (
    <div className="space-y-6">
      {/* Service Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              <CardTitle className="text-lg">Domestic Express (DOM)</CardTitle>
            </div>
            <CardDescription>Next-business-day delivery UAE-wide</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coverage:</span>
                <span className="font-medium">UAE-Wide</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Weight:</span>
                <span className="font-medium">Up to 5 kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Additional Weight:</span>
                <span className="font-medium">+1 AED/kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Volume Tiers:</span>
                <span className="font-medium">{domTiers.length} tiers</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-strong border-blue-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-400" />
              <CardTitle className="text-lg">Same-Day Delivery (SDD)</CardTitle>
            </div>
            <CardDescription>Dubai / Sharjah / Abu Dhabi city limits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cut-off Time:</span>
                <span className="font-medium">14:00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Base Weight:</span>
                <span className="font-medium">Up to 5 kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Weight:</span>
                <span className="font-medium">10 kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min Shipments:</span>
                <span className="font-medium">4 per collection</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DOM Rate Table */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Domestic Express (DOM) - Volume-Based Rates
          </CardTitle>
          <CardDescription>
            Rates automatically adjust based on monthly shipment volume
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading rates...</p>
          ) : domTiers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Volume Range</TableHead>
                    <TableHead>Base Rate (0-5 kg)</TableHead>
                    <TableHead>Additional kg</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domTiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell className="font-medium">
                        {tier.minVolume} - {tier.maxVolume || '∞'} shipments/month
                        {/* Show clients assigned to this tier */}
                        {clients && (
                          <div className="mt-2 pl-2 border-l-2 border-primary/20">
                            <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">
                              Assigned Clients ({clients.filter((c: any) => c.manualRateTierId === tier.id).length})
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {clients
                                .filter((c: any) => c.manualRateTierId === tier.id)
                                .map((client: any) => (
                                  <Badge key={client.id} variant="outline" className="text-[10px] h-5 bg-background border-primary/20">
                                    {client.companyName}
                                  </Badge>
                                ))}
                              {clients.filter((c: any) => c.manualRateTierId === tier.id).length === 0 && (
                                <span className="text-[10px] text-muted-foreground italic">No clients manually assigned</span>
                              )}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-green-400 font-semibold">
                          {parseFloat(tier.baseRate).toFixed(2)} AED
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-blue-400">
                          +{parseFloat(tier.additionalKgRate).toFixed(2)} AED/kg
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tier.isActive ? 'default' : 'secondary'}>
                          {tier.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No DOM rates configured</p>
          )}
        </CardContent>
      </Card>

      {/* SDD Rate Table */}
      <Card className="glass-strong border-blue-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Same-Day Delivery (SDD) - Fixed Rates
          </CardTitle>
          <CardDescription>
            Flat rate for same-day delivery within city limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Loading rates...</p>
          ) : sddTiers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Weight Range</TableHead>
                    <TableHead>Base Rate</TableHead>
                    <TableHead>Additional kg</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sddTiers.map((tier) => (
                    <TableRow key={tier.id}>
                      <TableCell className="font-medium">
                        0 - {tier.maxWeight} kg
                      </TableCell>
                      <TableCell>
                        <span className="text-green-400 font-semibold">
                          {parseFloat(tier.baseRate).toFixed(2)} AED
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-blue-400">
                          +{parseFloat(tier.additionalKgRate).toFixed(2)} AED/kg
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tier.isActive ? 'default' : 'secondary'}>
                          {tier.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No SDD rates configured</p>
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
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
              <p className="text-sm text-blue-200">
                <strong>Note:</strong> COD fees are calculated as 3.3% of the collected value, with a minimum fee of 2 AED.
                Settlement is processed on a weekly or bi-weekly basis as per client agreement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
