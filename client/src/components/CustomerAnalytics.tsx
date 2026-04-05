import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
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
    CheckCircle,
    DollarSign
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
    returned_to_sender: '#e11d48',
};

export default function CustomerAnalytics() {
    const { data: analytics, isLoading } = trpc.portal.customer.getMyAnalytics.useQuery(
        undefined,
        { refetchInterval: 60000 }
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

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <header className="flex justify-between items-center mb-10">
                <div>
                    <h2 className="text-4xl font-black text-foreground tracking-tight">Analytics</h2>
                    <p className="text-muted-foreground mt-1">Real-time logistics and shipment performance</p>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                {/* Today */}
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2">Today</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-foreground leading-tight">{analytics.shipmentsToday}</p>
                        <p className="text-muted-foreground text-sm font-medium">shipments</p>
                    </div>
                </div>

                {/* This Week */}
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2">This Week</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-foreground leading-tight">{analytics.shipmentsThisWeek}</p>
                        <p className="text-muted-foreground text-sm font-medium">shipments</p>
                    </div>
                </div>

                {/* This Month */}
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2">This Month</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-foreground leading-tight">{analytics.shipmentsThisMonth} <span className="text-muted-foreground font-medium text-lg">vs {analytics.shipmentsLastMonth}</span></p>
                    </div>
                </div>

                {/* Growth */}
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2">Growth</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-foreground leading-tight">{analytics.growthPercentage >= 0 ? '+' : ''}{analytics.growthPercentage}%</p>
                    </div>
                    <div className={`mt-4 flex items-center text-sm font-bold ${analytics.growthPercentage >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        <span className="material-symbols-outlined text-xs mr-1">{analytics.growthPercentage >= 0 ? 'trending_up' : 'trending_down'}</span>
                        <span>vs last month</span>
                    </div>
                </div>

                {/* Delivery Success Rate */}
                <div className="bg-card p-6 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:-translate-y-1 hover:border-primary/20 transition-all duration-300">
                    <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider mb-2">Success Rate</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold text-cyan-500 leading-tight">{analytics.deliverySuccessRate}%</p>
                    </div>
                    <div className="mt-4 flex items-center text-muted-foreground text-sm font-medium">
                        <span className="material-symbols-outlined text-xs mr-1">check_circle</span>
                        <span>delivered successfully</span>
                    </div>
                </div>
            </div>

            {/* COD Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-primary/5 p-6 rounded-xl border border-primary/10 flex items-center gap-5">
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">pending_actions</span>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Pending COD</p>
                        <p className="text-2xl font-black text-foreground">AED {analytics.codSummary.pending}</p>
                    </div>
                </div>
                <div className="bg-primary/5 p-6 rounded-xl border border-primary/10 flex items-center gap-5">
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">account_balance_wallet</span>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Collected COD</p>
                        <p className="text-2xl font-black text-foreground">AED {analytics.codSummary.collected}</p>
                    </div>
                </div>
                <div className="bg-primary/5 p-6 rounded-xl border border-primary/10 flex items-center gap-5">
                    <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">payments</span>
                    </div>
                    <div>
                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Remitted to You</p>
                        <p className="text-2xl font-black text-foreground">AED {analytics.codSummary.remitted}</p>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Daily Shipments Chart */}
                <div className="bg-card p-8 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Shipments Per Day</h3>
                            <p className="text-sm text-muted-foreground">Activity in the last 30 days</p>
                        </div>
                    </div>
                    <div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analytics.shipmentsPerDay}>
                                    <defs>
                                        <linearGradient id="colorShipmentsCustomer" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2e5bff" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#2e5bff" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={formatDate}
                                        stroke="#9ca3af"
                                        fontSize={10}
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
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke="#2e5bff"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorShipmentsCustomer)"
                                        name="Shipments"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Monthly Comparison Chart */}
                <div className="bg-card p-8 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Monthly Comparison</h3>
                            <p className="text-sm text-muted-foreground">Performance in last 6 months</p>
                        </div>
                    </div>
                    <div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
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
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="#6366f1"
                                        radius={[4, 4, 0, 0]}
                                        name="Shipments"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Distribution by City */}
                <div className="bg-card p-8 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Top Destinations</h3>
                            <p className="text-sm text-muted-foreground">Distribution by city</p>
                        </div>
                    </div>
                    <div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={analytics.distributionByCity}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                        outerRadius={90}
                                        fill="#10b981"
                                        dataKey="count"
                                        nameKey="city"
                                    >
                                        {analytics.distributionByCity.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1f2937',
                                            border: '1px solid #374151',
                                            borderRadius: '8px',
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-card p-8 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Status Distribution</h3>
                            <p className="text-sm text-muted-foreground">Current shipment statuses</p>
                        </div>
                    </div>
                    <div>
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.statusDistribution} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                    <XAxis type="number" stroke="#9ca3af" fontSize={12} />
                                    <YAxis
                                        type="category"
                                        dataKey="status"
                                        stroke="#9ca3af"
                                        fontSize={10}
                                        width={90}
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
                    </div>
                </div>
            </div>

            {/* Average Delivery Time by Route */}
            {analytics.deliveryTimeByRoute.length > 0 && (
                <div className="bg-card p-8 rounded-2xl border border-primary/10 shadow-xl shadow-primary/5 hover:border-primary/20 transition-all duration-300">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-lg font-bold text-foreground mb-1">Average Delivery Time by Route</h3>
                            <p className="text-sm text-muted-foreground">Your most used routes</p>
                        </div>
                    </div>
                    <div>
                        <div className="h-[300px]">
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
                                        width={140}
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
                                    <Legend />
                                    <Bar
                                        dataKey="avgHours"
                                        fill="#06b6d4"
                                        radius={[0, 4, 4, 0]}
                                        name="Avg Delivery Time (hours)"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Route Details Table */}
                        <div className="mt-8 rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Route</th>
                                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Deliveries</th>
                                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Avg Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analytics.deliveryTimeByRoute.map((route, index) => (
                                        <tr key={index} className="border-t border-border hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3 font-medium">{route.route}</td>
                                            <td className="px-4 py-3 text-right">
                                                <Badge variant="secondary" className="bg-background">{route.count}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-cyan-400">
                                                {route.avgHours}h
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
