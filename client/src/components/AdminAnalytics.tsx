import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    Clock,
    MapPin,
    BarChart3,
    Loader2,
    DollarSign,
    AlertTriangle,
    CheckCircle2,
    RotateCcw,
    Users,
    Activity,
} from 'lucide-react';

// Color palette for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

// Status color map
const STATUS_COLORS: Record<string, string> = {
    pending_pickup: '#f59e0b',
    picked_up: '#3b82f6',
    in_transit: '#8b5cf6',
    out_for_delivery: '#14b8a6',
    delivered: '#10b981',
    failed_delivery: '#ef4444',
    returned: '#6b7280',
};

const SERVICE_COLORS: Record<string, string> = {
    standard: '#3b82f6',
    'same-day': '#10b981',
    express: '#f59e0b',
    bullet: '#ef4444',
    DOM: '#3b82f6',
    SDD: '#10b981',
    BULLET: '#ef4444',
};

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

    // FADR color
    const fadrColor = analytics.firstAttemptDeliveryRate === null
        ? 'text-muted-foreground'
        : analytics.firstAttemptDeliveryRate >= 85
            ? 'text-emerald-400'
            : analytics.firstAttemptDeliveryRate >= 70
                ? 'text-yellow-400'
                : 'text-red-400';

    const fadrBorder = analytics.firstAttemptDeliveryRate === null
        ? 'border-border'
        : analytics.firstAttemptDeliveryRate >= 85
            ? 'border-emerald-500/20'
            : analytics.firstAttemptDeliveryRate >= 70
                ? 'border-yellow-500/20'
                : 'border-red-500/20';

    // Return rate color
    const returnColor = analytics.returnRate === null
        ? 'text-muted-foreground'
        : analytics.returnRate <= 5
            ? 'text-emerald-400'
            : analytics.returnRate <= 10
                ? 'text-yellow-400'
                : 'text-red-400';

    const returnBorder = analytics.returnRate === null
        ? 'border-border'
        : analytics.returnRate <= 5
            ? 'border-emerald-500/20'
            : analytics.returnRate <= 10
                ? 'border-yellow-500/20'
                : 'border-red-500/20';

    // Max revenue for relative bar in top clients table
    const maxRevenue = revenue?.topClients?.[0]?.totalRevenue || 1;

    // Revenue by service derived values
    const maxServiceRevenue = revenue?.revenueByService?.[0]?.amount || 1;
    const totalServiceRevenue = revenue?.revenueByService?.reduce((sum, s) => sum + s.amount, 0) || 1;

    return (
        <div className="space-y-6">
            {/* Overview Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
                            <Users className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">All time</span>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Total Clients</p>
                    <h3 className="text-2xl font-bold mt-1">{totalClients}</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(totalClients, 100)}%` }} />
                    </div>
                </div>
                <div className="bg-card p-6 rounded-2xl border border-blue-500/10 shadow-xl shadow-blue-500/5 hover:-translate-y-1 hover:border-blue-500/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-blue-500/10 rounded-lg text-blue-500">
                            <Package className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">All time</span>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Total Orders</p>
                    <h3 className="text-2xl font-bold mt-1">{totalOrders}</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                </div>
                <div className="bg-card p-6 rounded-2xl border border-green-500/10 shadow-xl shadow-green-500/5 hover:-translate-y-1 hover:border-green-500/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2.5 bg-green-500/10 rounded-lg text-green-500">
                            <Activity className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-muted-foreground">
                            {totalOrders > 0 ? `${Math.round((activeOrders / totalOrders) * 100)}% of total` : 'No orders'}
                        </span>
                    </div>
                    <p className="text-muted-foreground text-sm font-medium">Active Orders</p>
                    <h3 className="text-2xl font-bold mt-1">{activeOrders}</h3>
                    <div className="mt-4 h-1.5 w-full bg-border rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${totalOrders > 0 ? (activeOrders / totalOrders) * 100 : 0}%` }} />
                    </div>
                </div>
            </div>

            {/* Summary Cards Row 1 — Shipment Volume */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Today */}
                <Card className="glass-strong border-blue-500/20 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Today</CardTitle>
                        <Calendar className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-400">{analytics.shipmentsToday}</div>
                        <p className="text-xs text-muted-foreground">shipments created</p>
                    </CardContent>
                </Card>

                {/* This Week */}
                <Card className="glass-strong border-green-500/20 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Week</CardTitle>
                        <Package className="h-4 w-4 text-green-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-400">{analytics.shipmentsThisWeek}</div>
                        <p className="text-xs text-muted-foreground">shipments this week</p>
                    </CardContent>
                </Card>

                {/* This Month */}
                <Card className="glass-strong border-purple-500/20 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Month</CardTitle>
                        <BarChart3 className="h-4 w-4 text-purple-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-purple-400">{analytics.shipmentsThisMonth}</div>
                        <p className="text-xs text-muted-foreground">vs {analytics.shipmentsLastMonth} last month</p>
                    </CardContent>
                </Card>

                {/* Growth */}
                <Card className={`glass-strong overflow-hidden ${analytics.growthPercentage >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Month Growth</CardTitle>
                        {analytics.growthPercentage >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-emerald-400" />
                        ) : (
                            <TrendingDown className="h-4 w-4 text-red-400" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${analytics.growthPercentage >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {analytics.growthPercentage >= 0 ? '+' : ''}{analytics.growthPercentage}%
                        </div>
                        <p className="text-xs text-muted-foreground">compared to last month</p>
                    </CardContent>
                </Card>
            </div>

            {/* KPI Cards Row 2 — Operational & Financial */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* FADR */}
                <Card className={`glass-strong overflow-hidden ${fadrBorder}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">First Attempt Delivery</CardTitle>
                        <CheckCircle2 className={`h-4 w-4 ${fadrColor}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${fadrColor}`}>
                            {analytics.firstAttemptDeliveryRate !== null ? `${analytics.firstAttemptDeliveryRate}%` : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">FADR — target &gt;85%</p>
                    </CardContent>
                </Card>

                {/* Return Rate */}
                <Card className={`glass-strong overflow-hidden ${returnBorder}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Return Rate</CardTitle>
                        <RotateCcw className={`h-4 w-4 ${returnColor}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${returnColor}`}>
                            {analytics.returnRate !== null ? `${analytics.returnRate}%` : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">target &lt;5%</p>
                    </CardContent>
                </Card>

                {/* Accounts Receivable */}
                <Card className={`glass-strong overflow-hidden ${analytics.overdueAmount > 0 ? 'border-red-500/20' : 'border-border'}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Accounts Receivable</CardTitle>
                        {analytics.overdueAmount > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-red-400" />
                        ) : (
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                        )}
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                            {formatAED(analytics.totalAccountsReceivable)}
                        </div>
                        {analytics.overdueAmount > 0 && (
                            <p className="text-xs text-red-400 mt-1">
                                {formatAED(analytics.overdueAmount)} overdue
                            </p>
                        )}
                        {analytics.overdueAmount === 0 && (
                            <p className="text-xs text-muted-foreground">pending invoices</p>
                        )}
                    </CardContent>
                </Card>

                {/* Revenue This Month */}
                <Card className="glass-strong border-cyan-500/20 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue This Month</CardTitle>
                        <DollarSign className="h-4 w-4 text-cyan-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-cyan-400">
                            {formatAED(analytics.revenueThisMonth)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            vs {formatAED(analytics.revenueLastMonth)} last month
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Shipment Operations Section */}
            <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-400" />
                    Shipment Operations
                </h3>

                {/* Shipment Volume — toggled 30d / 6m */}
                <Card className="glass-strong border-border overflow-hidden mb-6">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="h-5 w-5 text-blue-400" />
                                    Shipment Volume
                                </CardTitle>
                                <CardDescription>
                                    {shipmentView === '30d'
                                        ? 'Last 30 days — click a point to see shipments'
                                        : 'Last 6 months'}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-1 rounded-md border border-border p-1">
                                <Button
                                    variant={shipmentView === '30d' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setShipmentView('30d')}
                                    className="h-7 px-3 text-xs"
                                >
                                    30 Days
                                </Button>
                                <Button
                                    variant={shipmentView === '6m' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setShipmentView('6m')}
                                    className="h-7 px-3 text-xs"
                                >
                                    6 Months
                                </Button>
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
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={formatDate}
                                            stroke="#9ca3af"
                                            fontSize={11}
                                            interval="preserveStartEnd"
                                        />
                                        <YAxis stroke="#9ca3af" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                border: '1px solid #374151',
                                                borderRadius: '8px',
                                            }}
                                            labelFormatter={formatDate}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="count"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#colorShipments)"
                                            name="Shipments"
                                        />
                                    </AreaChart>
                                ) : (
                                    <BarChart data={analytics.monthlyComparison}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis
                                            dataKey="month"
                                            tickFormatter={formatMonth}
                                            stroke="#9ca3af"
                                            fontSize={12}
                                        />
                                        <YAxis stroke="#9ca3af" fontSize={12} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                border: '1px solid #374151',
                                                borderRadius: '8px',
                                            }}
                                            labelFormatter={formatMonth}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="#8b5cf6"
                                            radius={[4, 4, 0, 0]}
                                            name="Shipments"
                                        />
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* City Distribution + Status Distribution side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Distribution by City — horizontal bar */}
                    <Card className="glass-strong border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-green-400" />
                                Distribution by City
                            </CardTitle>
                            <CardDescription>Top 10 destinations</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.distributionByCity} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                                        <YAxis
                                            type="category"
                                            dataKey="city"
                                            stroke="#9ca3af"
                                            fontSize={11}
                                            width={90}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                border: '1px solid #374151',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value: number) => [value, 'Shipments']}
                                        />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]} name="Shipments">
                                            {analytics.distributionByCity.map((_entry, index) => (
                                                <Cell key={`city-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Status Distribution */}
                    <Card className="glass-strong border-border overflow-hidden">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-orange-400" />
                                Status Distribution
                            </CardTitle>
                            <CardDescription>All shipments by status</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={analytics.statusDistribution} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                                        <YAxis
                                            type="category"
                                            dataKey="status"
                                            stroke="#9ca3af"
                                            fontSize={11}
                                            width={100}
                                            tickFormatter={(value) => value.replace(/_/g, ' ')}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#1f2937',
                                                border: '1px solid #374151',
                                                borderRadius: '8px',
                                            }}
                                            formatter={(value: number) => [value, 'Shipments']}
                                            labelFormatter={(label) => label.replace(/_/g, ' ')}
                                        />
                                        <Bar
                                            dataKey="count"
                                            radius={[0, 4, 4, 0]}
                                            name="Count"
                                        >
                                            {analytics.statusDistribution.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Average Delivery Time by Route */}
                <Card className="glass-strong border-border overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-cyan-400" />
                            Average Delivery Time by Route
                        </CardTitle>
                        <CardDescription>Top 10 routes by volume</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.deliveryTimeByRoute} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis
                                        type="number"
                                        stroke="#9ca3af"
                                        fontSize={12}
                                        tickFormatter={(value) => `${value}h`}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="route"
                                        stroke="#9ca3af"
                                        fontSize={11}
                                        width={150}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1f2937',
                                            border: '1px solid #374151',
                                            borderRadius: '8px',
                                        }}
                                        formatter={(value: number, name: string) => {
                                            if (name === 'avgHours') return [`${value} hours`, 'Avg Time'];
                                            return [value, 'Shipments'];
                                        }}
                                    />
                                    <Bar
                                        dataKey="avgHours"
                                        fill="#14b8a6"
                                        radius={[0, 4, 4, 0]}
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
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-cyan-400" />
                    Revenue Dashboard
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Monthly Revenue Chart */}
                    <Card className="glass-strong border-cyan-500/20 overflow-hidden">
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
                                        <BarChart data={revenue?.monthlyRevenue || []}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis
                                                dataKey="month"
                                                tickFormatter={formatMonth}
                                                stroke="#9ca3af"
                                                fontSize={12}
                                            />
                                            <YAxis
                                                stroke="#9ca3af"
                                                fontSize={11}
                                                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#1f2937',
                                                    border: '1px solid #374151',
                                                    borderRadius: '8px',
                                                }}
                                                labelFormatter={formatMonth}
                                                formatter={(value: number) => [formatAED(value), 'Revenue']}
                                            />
                                            <Bar
                                                dataKey="revenue"
                                                fill="#14b8a6"
                                                radius={[4, 4, 0, 0]}
                                                name="Revenue (AED)"
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Revenue by Service Type — bar list */}
                    <Card className="glass-strong border-border overflow-hidden">
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
                                        const color = SERVICE_COLORS[entry.service] || COLORS[index % COLORS.length];
                                        return (
                                            <div key={entry.service} className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground w-5 text-right">{index + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-sm font-medium truncate">{entry.service}</span>
                                                        <span className="text-sm font-mono ml-2 shrink-0" style={{ color }}>
                                                            {formatAED(entry.amount)}
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${(entry.amount / maxServiceRevenue) * 100}%`,
                                                                backgroundColor: color,
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                                <Badge variant="secondary" className="text-xs shrink-0">
                                                    {pct}%
                                                </Badge>
                                                <Badge variant="outline" className="text-xs shrink-0">
                                                    {entry.count} shp
                                                </Badge>
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
                    <Card className="glass-strong border-border overflow-hidden mt-6">
                        <CardHeader>
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-emerald-400" />
                                Top Clients by Revenue
                            </CardTitle>
                            <CardDescription>Ranked by total invoiced amount</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {revenue.topClients.map((client, index) => (
                                    <div key={client.clientId} className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground w-5 text-right">{index + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm font-medium truncate">{client.companyName}</span>
                                                <span className="text-sm font-mono text-emerald-400 ml-2 shrink-0">
                                                    {formatAED(client.totalRevenue)}
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-emerald-500 rounded-full"
                                                    style={{ width: `${(client.totalRevenue / maxRevenue) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className="text-xs shrink-0">
                                            {client.invoiceCount} inv
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Drill-down Modal */}
            <Dialog open={!!drillDownDate} onOpenChange={() => { setDrillDownDate(null); setDrillDownWaybills([]); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-blue-400" />
                            Shipments on {drillDownDate ? new Date(drillDownDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {drillDownWaybills.length === 0 ? (
                            <p className="text-center py-6 text-muted-foreground">No shipments found for this date</p>
                        ) : (
                            <div className="space-y-1">
                                {drillDownWaybills.map((waybill, i) => (
                                    <div key={i} className="px-3 py-2 rounded-md bg-muted/40 font-mono text-sm">
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
