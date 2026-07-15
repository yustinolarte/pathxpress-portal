import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    ResponsiveContainer
} from 'recharts';
import {
    TrendingUp,
    TrendingDown,
    Package,
    Calendar,
    Loader2,
    DollarSign,
    AlertTriangle,
    CheckCircle2,
    RotateCcw,
    Users,
    Activity,
    BarChart3,
} from 'lucide-react';
import { statusColor, AXIS_TICK, TOOLTIP_STYLE } from '@/lib/statusStyles';

// Ink-dominant chart language: data is ink, red is the accent,
// color elsewhere is functional (status) only.
const INK_BAR = 'var(--ink)';
const ACCENT = 'var(--primary)';
const GRID = 'var(--line)';

interface AdminAnalyticsProps {
    totalClients?: number;
    totalOrders?: number;
    activeOrders?: number;
}

export default function AdminAnalytics({ totalClients = 0, totalOrders = 0, activeOrders = 0 }: AdminAnalyticsProps) {
    const [drillDownDate, setDrillDownDate] = useState<string | null>(null);
    const [drillDownWaybills, setDrillDownWaybills] = useState<string[]>([]);
    const [shipmentView, setShipmentView] = useState<'30d' | '6m'>('30d');

    const { data: analytics, isLoading } = trpc.portal.admin.getAnalytics.useQuery(
        undefined,
        { refetchInterval: 60000 }
    );

    const { data: revenue, isLoading: revenueLoading } = trpc.portal.admin.getRevenueAnalytics.useQuery(
        undefined,
        { refetchInterval: 120000 }
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Loading analytics...</span>
            </div>
        );
    }

    if (!analytics) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No analytics data available
            </div>
        );
    }

    // Format month labels
    const formatMonth = (month: string) => {
        const [year, m] = month.split('-');
        const date = new Date(parseInt(year), parseInt(m) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    // Format date labels for daily chart
    const formatDate = (date: string) => {
        const d = new Date(date);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatAED = (val: number) =>
        new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(val);

    // FADR — green when on target, amber when borderline, red when failing
    const fadrColor = analytics.firstAttemptDeliveryRate === null
        ? 'var(--muted-foreground)'
        : analytics.firstAttemptDeliveryRate >= 85
            ? 'var(--st-green)'
            : analytics.firstAttemptDeliveryRate >= 70
                ? 'var(--st-amber)'
                : 'var(--primary)';

    const returnRateColor = analytics.returnRate === null
        ? 'var(--muted-foreground)'
        : analytics.returnRate <= 5
            ? 'var(--st-green)'
            : analytics.returnRate <= 10
                ? 'var(--st-amber)'
                : 'var(--primary)';

    // Max revenue for relative bar in top clients table
    const maxRevenue = revenue?.topClients?.[0]?.totalRevenue || 1;

    // Revenue by service derived values
    const maxServiceRevenue = revenue?.revenueByService?.[0]?.amount || 1;
    const totalServiceRevenue = revenue?.revenueByService?.reduce((sum, s) => sum + s.amount, 0) || 1;

    const monthlyComparison = analytics.monthlyComparison || [];
    const monthlyRevenue = revenue?.monthlyRevenue || [];

    return (
        <div className="space-y-6">
            {/* KPI row — network totals; receivable as the dark band card */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Total Clients</span>
                        <span className="ic"><Users className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{totalClients}</div>
                    <div className="sub">registered accounts</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Total Orders</span>
                        <span className="ic"><Package className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{totalOrders.toLocaleString()}</div>
                    <div className="sub">all time</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Active Orders</span>
                        <span className="ic"><Activity className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{activeOrders.toLocaleString()}</div>
                    <div className="sub">
                        {totalOrders > 0 ? `${Math.round((activeOrders / totalOrders) * 100)}% of total in motion` : 'no orders yet'}
                    </div>
                </div>
                <div className="kpi accent">
                    <div className="kt">
                        <span className="lab">Accounts Receivable</span>
                        <span className="ic">
                            {analytics.overdueAmount > 0
                                ? <AlertTriangle className="w-[18px] h-[18px]" />
                                : <DollarSign className="w-[18px] h-[18px]" />}
                        </span>
                    </div>
                    <div className="val">{formatAED(analytics.totalAccountsReceivable)}</div>
                    <div className="sub">
                        {analytics.overdueAmount > 0
                            ? <>incl. <span className="money" style={{ color: 'var(--primary)' }}>{formatAED(analytics.overdueAmount)}</span> overdue</>
                            : 'pending invoices'}
                    </div>
                </div>
            </div>

            {/* Volume row */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Today</span>
                        <span className="ic"><Calendar className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{analytics.shipmentsToday}</div>
                    <div className="sub">shipments created</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">This Week</span>
                        <span className="ic"><Package className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{analytics.shipmentsThisWeek}</div>
                    <div className="sub">shipments this week</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">This Month</span>
                        <span className="ic"><BarChart3 className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{analytics.shipmentsThisMonth}</div>
                    <div className="sub">vs {analytics.shipmentsLastMonth} last month</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Month Growth</span>
                        <span className="ic">
                            {analytics.growthPercentage >= 0
                                ? <TrendingUp className="w-[18px] h-[18px]" />
                                : <TrendingDown className="w-[18px] h-[18px]" />}
                        </span>
                    </div>
                    <div className="val">{analytics.growthPercentage >= 0 ? '+' : ''}{analytics.growthPercentage}%</div>
                    <div className="sub">
                        <span className={`trend ${analytics.growthPercentage >= 0 ? 'up' : 'down'}`}>
                            {analytics.growthPercentage >= 0 ? '▲' : '▼'} {Math.abs(analytics.growthPercentage)}%
                        </span>
                        vs last month
                    </div>
                </div>
            </div>

            {/* Operational quality row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">First Attempt Delivery</span>
                        <span className="ic"><CheckCircle2 className="w-[18px] h-[18px]" style={{ color: fadrColor }} /></span>
                    </div>
                    <div className="val" style={{ color: fadrColor }}>
                        {analytics.firstAttemptDeliveryRate !== null ? `${analytics.firstAttemptDeliveryRate}%` : '—'}
                    </div>
                    <div className="sub">FADR — target &gt;85%</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Return Rate</span>
                        <span className="ic"><RotateCcw className="w-[18px] h-[18px]" style={{ color: returnRateColor }} /></span>
                    </div>
                    <div className="val" style={{ color: returnRateColor }}>
                        {analytics.returnRate !== null ? `${analytics.returnRate}%` : '—'}
                    </div>
                    <div className="sub">target &lt;5%</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Revenue This Month</span>
                        <span className="ic"><DollarSign className="w-[18px] h-[18px]" /></span>
                    </div>
                    <div className="val">{formatAED(analytics.revenueThisMonth)}</div>
                    <div className="sub">vs {formatAED(analytics.revenueLastMonth)} last month</div>
                </div>
            </div>

            {/* Shipment Operations Section */}
            <div>
                <p className="eyebrow mb-2">Operations</p>
                <h3 className="font-display text-lg font-semibold mb-4">Shipment Operations</h3>

                {/* Shipment Volume — toggled 30d / 6m */}
                <Card className="bg-card border-border overflow-hidden mb-6">
                    <CardHeader>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <div>
                                <CardTitle>Shipment Volume</CardTitle>
                                <CardDescription>
                                    {shipmentView === '30d'
                                        ? 'Last 30 days — click a point to see shipments'
                                        : 'Last 6 months'}
                                </CardDescription>
                            </div>
                            <div className="seg">
                                <button className={shipmentView === '30d' ? 'on' : ''} onClick={() => setShipmentView('30d')}>
                                    30 Days
                                </button>
                                <button className={shipmentView === '6m' ? 'on' : ''} onClick={() => setShipmentView('6m')}>
                                    6 Months
                                </button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                {shipmentView === '30d' ? (
                                    <AreaChart
                                        data={analytics.shipmentsPerDay}
                                        onClick={(data) => {
                                            if (data?.activePayload?.[0]) {
                                                const point = data.activePayload[0].payload as { date: string; count: number; waybills: string[] };
                                                setDrillDownDate(point.date);
                                                setDrillDownWaybills(point.waybills || []);
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <defs>
                                            <linearGradient id="colorShipments" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.18} />
                                                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={formatDate}
                                            tick={AXIS_TICK}
                                            stroke={GRID}
                                            tickLine={false}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis tick={AXIS_TICK} stroke={GRID} tickLine={false} axisLine={false} width={36} />
                                        <Tooltip
                                            contentStyle={TOOLTIP_STYLE}
                                            labelFormatter={formatDate}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="count"
                                            stroke={ACCENT}
                                            strokeWidth={2.5}
                                            fillOpacity={1}
                                            fill="url(#colorShipments)"
                                            name="Shipments"
                                            activeDot={{ r: 5, fill: 'var(--card)', stroke: ACCENT, strokeWidth: 2.5 }}
                                        />
                                    </AreaChart>
                                ) : (
                                    <BarChart data={monthlyComparison}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                                        <XAxis
                                            dataKey="month"
                                            tickFormatter={formatMonth}
                                            tick={AXIS_TICK}
                                            stroke={GRID}
                                            tickLine={false}
                                        />
                                        <YAxis tick={AXIS_TICK} stroke={GRID} tickLine={false} axisLine={false} width={36} />
                                        <Tooltip
                                            contentStyle={TOOLTIP_STYLE}
                                            cursor={{ fill: 'var(--surface-2)' }}
                                            labelFormatter={formatMonth}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={34} name="Shipments">
                                            {monthlyComparison.map((_entry, index) => (
                                                <Cell
                                                    key={`m-${index}`}
                                                    fill={index === monthlyComparison.length - 1 ? ACCENT : INK_BAR}
                                                    fillOpacity={index === monthlyComparison.length - 1 ? 1 : 0.82}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* City Distribution + Status Distribution side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Distribution by City — horizontal bar */}
                    <Card className="bg-card border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle>Distribution by City</CardTitle>
                            <CardDescription>Top 10 destinations</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.distributionByCity} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                                        <XAxis type="number" tick={AXIS_TICK} stroke={GRID} tickLine={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="city"
                                            tick={{ ...AXIS_TICK, fontSize: 11 }}
                                            stroke={GRID}
                                            tickLine={false}
                                            axisLine={false}
                                            width={92}
                                        />
                                        <Tooltip
                                            contentStyle={TOOLTIP_STYLE}
                                            cursor={{ fill: 'var(--surface-2)' }}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20} name="Shipments">
                                            {analytics.distributionByCity.map((_entry, index) => (
                                                <Cell
                                                    key={`city-cell-${index}`}
                                                    fill={index === 0 ? ACCENT : INK_BAR}
                                                    fillOpacity={index === 0 ? 1 : 0.82}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Status Distribution — functional colors */}
                    <Card className="bg-card border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle>Status Distribution</CardTitle>
                            <CardDescription>All shipments by status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.statusDistribution} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                                        <XAxis type="number" tick={AXIS_TICK} stroke={GRID} tickLine={false} />
                                        <YAxis
                                            type="category"
                                            dataKey="status"
                                            tick={{ ...AXIS_TICK, fontSize: 10 }}
                                            stroke={GRID}
                                            tickLine={false}
                                            axisLine={false}
                                            width={104}
                                            tickFormatter={(value) => value.replace(/_/g, ' ')}
                                        />
                                        <Tooltip
                                            contentStyle={TOOLTIP_STYLE}
                                            cursor={{ fill: 'var(--surface-2)' }}
                                            formatter={(value: number) => [value, 'Shipments']}
                                            labelFormatter={(label) => label.replace(/_/g, ' ')}
                                        />
                                        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={20} name="Count">
                                            {analytics.statusDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={statusColor(entry.status)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Average Delivery Time by Route */}
                <Card className="bg-card border-border overflow-hidden">
                    <CardHeader>
                        <CardTitle>Average Delivery Time by Route</CardTitle>
                        <CardDescription>Top 10 routes by volume</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.deliveryTimeByRoute} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                                    <XAxis
                                        type="number"
                                        tick={AXIS_TICK}
                                        stroke={GRID}
                                        tickLine={false}
                                        tickFormatter={(value) => `${value}h`}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="route"
                                        tick={{ ...AXIS_TICK, fontSize: 10 }}
                                        stroke={GRID}
                                        tickLine={false}
                                        axisLine={false}
                                        width={150}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ fill: 'var(--surface-2)' }}
                                        formatter={(value: number, name: string) => {
                                            if (name === 'avgHours') return [`${value} hours`, 'Avg Time'];
                                            return [value, 'Shipments'];
                                        }}
                                    />
                                    <Bar
                                        dataKey="avgHours"
                                        fill="var(--st-blue)"
                                        radius={[0, 6, 6, 0]}
                                        maxBarSize={20}
                                        name="Avg Delivery Time (hours)"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Revenue Dashboard Section */}
            <div>
                <p className="eyebrow mb-2">Finance</p>
                <h3 className="font-display text-lg font-semibold mb-4">Revenue Dashboard</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Monthly Revenue Chart */}
                    <Card className="bg-card border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
                            <CardDescription>Last 6 months (from invoices)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {revenueLoading ? (
                                <div className="flex items-center justify-center h-[260px]">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="h-[260px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={monthlyRevenue}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                                            <XAxis
                                                dataKey="month"
                                                tickFormatter={formatMonth}
                                                tick={AXIS_TICK}
                                                stroke={GRID}
                                                tickLine={false}
                                            />
                                            <YAxis
                                                tick={AXIS_TICK}
                                                stroke={GRID}
                                                tickLine={false}
                                                axisLine={false}
                                                width={40}
                                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                            />
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                cursor={{ fill: 'var(--surface-2)' }}
                                                labelFormatter={formatMonth}
                                                formatter={(value: number) => [formatAED(value), 'Revenue']}
                                            />
                                            <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={34} name="Revenue (AED)">
                                                {monthlyRevenue.map((_entry, index) => (
                                                    <Cell
                                                        key={`rev-${index}`}
                                                        fill={index === monthlyRevenue.length - 1 ? ACCENT : INK_BAR}
                                                        fillOpacity={index === monthlyRevenue.length - 1 ? 1 : 0.82}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Revenue by Service Type — bar list */}
                    <Card className="bg-card border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Revenue by Service Type</CardTitle>
                            <CardDescription>Breakdown from invoice line items</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {revenueLoading ? (
                                <div className="flex items-center justify-center h-[260px]">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : revenue?.revenueByService && revenue.revenueByService.length > 0 ? (
                                <div className="space-y-3">
                                    {revenue.revenueByService.map((entry, index) => {
                                        const pct = Math.round((entry.amount / totalServiceRevenue) * 100);
                                        return (
                                            <div key={entry.service} className="flex items-center gap-3">
                                                <span className="font-mono text-xs text-muted-foreground w-5 text-right">{index + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-display text-sm font-semibold truncate">{entry.service}</span>
                                                        <span className="money text-sm ml-2 shrink-0">
                                                            {formatAED(entry.amount)}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${(entry.amount / maxServiceRevenue) * 100}%`,
                                                                background: index === 0 ? ACCENT : INK_BAR,
                                                                opacity: index === 0 ? 1 : 0.82,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className="pill shrink-0">{pct}%</span>
                                                <span className="pill shrink-0">{entry.count} shp</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[260px] text-muted-foreground text-sm">
                                    No invoice data available yet
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Top Clients by Revenue */}
                {revenue?.topClients && revenue.topClients.length > 0 && (
                    <Card className="bg-card border-border overflow-hidden mt-6">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">Top Clients by Revenue</CardTitle>
                            <CardDescription>Ranked by total invoiced amount</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {revenue.topClients.map((client, index) => (
                                    <div key={client.clientId} className="flex items-center gap-3">
                                        <span className="font-mono text-xs text-muted-foreground w-5 text-right">{index + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-display text-sm font-semibold truncate">{client.companyName}</span>
                                                <span className="money text-sm ml-2 shrink-0" style={{ color: 'var(--st-green)' }}>
                                                    {formatAED(client.totalRevenue)}
                                                </span>
                                            </div>
                                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${(client.totalRevenue / maxRevenue) * 100}%`,
                                                        background: 'var(--st-green)',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <span className="pill shrink-0">{client.invoiceCount} inv</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Drill-down Modal */}
            <Dialog open={!!drillDownDate} onOpenChange={() => { setDrillDownDate(null); setDrillDownWaybills([]); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            Shipments on {drillDownDate ? new Date(drillDownDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {drillDownWaybills.length === 0 ? (
                            <p className="text-center py-6 text-muted-foreground">No shipments found for this date</p>
                        ) : (
                            <div className="space-y-1">
                                {drillDownWaybills.map((waybill, i) => (
                                    <div key={i} className="px-3 py-2 rounded-md bg-muted/40 wb">
                                        {waybill}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{drillDownWaybills.length} shipment(s)</p>
                </DialogContent>
            </Dialog>
        </div>
    );
}
