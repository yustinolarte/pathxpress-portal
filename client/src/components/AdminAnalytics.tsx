import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
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
    Loader2
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

export default function AdminAnalytics() {
    const { token } = usePortalAuth();

    const { data: analytics, isLoading } = trpc.portal.admin.getAnalytics.useQuery(
        { token: token || '' },
        { enabled: !!token, refetchInterval: 60000 } // Refresh every minute
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
        <div className="space-y-6">
            {/* Summary Cards */}
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

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Daily Shipments Chart */}
                <Card className="glass-strong border-border overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-blue-400" />
                            Shipments Per Day
                        </CardTitle>
                        <CardDescription>Last 30 days</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={analytics.shipmentsPerDay}>
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
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Monthly Comparison Chart */}
                <Card className="glass-strong border-border overflow-hidden">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-purple-400" />
                            Monthly Comparison
                        </CardTitle>
                        <CardDescription>Last 6 months</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
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
                                        fill="#8b5cf6"
                                        radius={[4, 4, 0, 0]}
                                        name="Shipments"
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Distribution by City */}
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
                                <PieChart>
                                    <Pie
                                        data={analytics.distributionByCity}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                        outerRadius={100}
                                        fill="#8884d8"
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
                                <Legend />
                                <Bar
                                    dataKey="avgHours"
                                    fill="#14b8a6"
                                    radius={[0, 4, 4, 0]}
                                    name="Avg Delivery Time (hours)"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Route Details Table */}
                    <div className="mt-4 rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium">Route</th>
                                    <th className="px-4 py-2 text-right font-medium">Deliveries</th>
                                    <th className="px-4 py-2 text-right font-medium">Avg Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.deliveryTimeByRoute.map((route, index) => (
                                    <tr key={index} className="border-t border-border hover:bg-muted/30">
                                        <td className="px-4 py-2">{route.route}</td>
                                        <td className="px-4 py-2 text-right">
                                            <Badge variant="secondary">{route.count}</Badge>
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono">
                                            {route.avgHours}h
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
