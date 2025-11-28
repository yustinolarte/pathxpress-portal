import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Search, MapPin, Calendar, Weight, Box } from 'lucide-react';
import { APP_LOGO, APP_TITLE } from '@/const';

export default function TrackShipment() {
  const [waybillNumber, setWaybillNumber] = useState('');
  const [searchedWaybill, setSearchedWaybill] = useState('');

  const { data, isLoading, error } = trpc.portal.publicTracking.track.useQuery(
    { waybillNumber: searchedWaybill },
    { enabled: !!searchedWaybill, retry: false }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (waybillNumber.trim()) {
      setSearchedWaybill(waybillNumber.trim());
    }
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      pending_pickup: 'bg-yellow-500',
      in_transit: 'bg-blue-500',
      out_for_delivery: 'bg-purple-500',
      delivered: 'bg-green-500',
      failed_delivery: 'bg-red-500',
      returned: 'bg-gray-500',
    };
    return statusMap[status] || 'bg-gray-400';
  };

  const getStatusLabel = (status: string) => {
    return status.replace(/_/g, ' ').toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="Logo" className="h-8 w-8" />
            <span className="text-xl font-bold text-white">{APP_TITLE}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/portal/login'}
            className="border-white/20 text-white hover:bg-white/10"
          >
            Customer Login
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Search Section */}
          <Card className="glass-strong border-white/10">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-blue-500/20">
                  <Package className="h-12 w-12 text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-3xl text-white">Track Your Shipment</CardTitle>
              <CardDescription className="text-gray-300">
                Enter your waybill number to track your package in real-time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  placeholder="Enter waybill number (e.g., PX20240001)"
                  value={waybillNumber}
                  onChange={(e) => setWaybillNumber(e.target.value)}
                  className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-400"
                />
                <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                  <Search className="h-4 w-4 mr-2" />
                  Track
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Error State */}
          {error && (
            <Card className="glass-strong border-red-500/20 bg-red-500/10">
              <CardContent className="pt-6">
                <p className="text-center text-red-300">
                  {error.message || 'Shipment not found. Please check your waybill number and try again.'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Results */}
          {data && (
            <div className="space-y-6">
              {/* Shipment Info Card */}
              <Card className="glass-strong border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white">Shipment Details</CardTitle>
                    <Badge className={`${getStatusColor(data.order.status)} text-white`}>
                      {getStatusLabel(data.order.status)}
                    </Badge>
                  </div>
                  <CardDescription className="text-gray-300">
                    Waybill: {data.order.waybillNumber}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-gray-300">
                    <MapPin className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Destination</div>
                      <div className="font-medium text-white">
                        {data.order.city}, {data.order.destinationCountry}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Box className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Service Type</div>
                      <div className="font-medium text-white">{data.order.serviceType}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Weight className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Weight</div>
                      <div className="font-medium text-white">{data.order.weight} kg</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Package className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Pieces</div>
                      <div className="font-medium text-white">{data.order.pieces}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Calendar className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Created</div>
                      <div className="font-medium text-white">
                        {new Date(data.order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-gray-300">
                    <Calendar className="h-5 w-5 text-blue-400" />
                    <div>
                      <div className="text-sm text-gray-400">Last Update</div>
                      <div className="font-medium text-white">
                        {new Date(data.order.lastStatusUpdate).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tracking Timeline */}
              <Card className="glass-strong border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Tracking History</CardTitle>
                  <CardDescription className="text-gray-300">
                    Real-time updates on your shipment journey
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative space-y-6">
                    {/* Timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 to-transparent" />

                    {data.trackingEvents
                      .sort((a, b) => new Date(b.eventDatetime).getTime() - new Date(a.eventDatetime).getTime())
                      .map((event, index) => (
                        <div key={event.id} className="relative flex gap-4">
                          {/* Timeline dot */}
                          <div
                            className={`relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                              index === 0 ? 'bg-blue-500' : 'bg-gray-600'
                            }`}
                          >
                            <div className="w-3 h-3 rounded-full bg-white" />
                          </div>

                          {/* Event content */}
                          <div className="flex-1 pb-6">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h4 className="font-semibold text-white">{event.statusLabel}</h4>
                                <p className="text-sm text-gray-300 mt-1">{event.description}</p>
                                {event.location && (
                                  <p className="text-sm text-gray-400 mt-1 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {event.location}
                                  </p>
                                )}
                              </div>
                              <div className="text-right text-sm text-gray-400 flex-shrink-0">
                                <div>{new Date(event.eventDatetime).toLocaleDateString()}</div>
                                <div>{new Date(event.eventDatetime).toLocaleTimeString()}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/20 backdrop-blur-sm mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-gray-400 text-sm">
          <p>© 2025 {APP_TITLE}. All rights reserved.</p>
          <p className="mt-2">Need help? Contact us at support@pathxpress.net or +971 522803433</p>
        </div>
      </footer>
    </div>
  );
}
