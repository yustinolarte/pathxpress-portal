import { trpc } from '@/lib/trpc';
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
    ResponsiveContainer
} from 'recharts';
import {
    Loader2,
} from 'lucide-react';
import { statusColor, CHART_PALETTE, AXIS_TICK, TOOLTIP_STYLE } from '@/lib/statusStyles';

// Ink-dominant chart language: data is ink, red is the accent.
const INK_BAR = 'var(--ink)';
const ACCENT = 'var(--primary)';
const GRID = 'var(--line)';

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                <div className="kpi">
                    <div className="kt"><span className="lab">Today</span></div>
                    <div className="val">{analytics.shipmentsToday}</div>
                    <div className="sub">shipments</div>
                </div>
                <div className="kpi">
                    <div className="kt"><span className="lab">This Week</span></div>
                    <div className="val">{analytics.shipmentsThisWeek}</div>
                    <div className="sub">shipments</div>
                </div>
                <div className="kpi">
                    <div className="kt"><span className="lab">This Month</span></div>
                    <div className="val">{analytics.shipmentsThisMonth}</div>
                    <div className="sub">vs {analytics.shipmentsLastMonth} last month</div>
                </div>
                <div className="kpi">
                    <div className="kt"><span className="lab">Growth</span></div>
                    <div className="val">{analytics.growthPercentage >= 0 ? '+' : ''}{analytics.growthPercentage}%</div>
                    <div className="sub">
                        <span className={`trend ${analytics.growthPercentage >= 0 ? 'up' : 'down'}`}>
                            {analytics.growthPercentage >= 0 ? '▲' : '▼'} {Math.abs(analytics.growthPercentage)}%
                        </span>
                        vs last month
                    </div>
                </div>
                <div className="kpi">
                    <div className="kt"><span className="lab">Success Rate</span></div>
                    <div className="val" style={{ color: 'var(--st-green)' }}>{analytics.deliverySuccessRate}%</div>
                    <div className="sub">delivered successfully</div>
                </div>
            </div>

            {/* COD Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Pending COD</span>
                        <span className="ic"><span className="material-symbols-outlined text-[18px]">pending_actions</span></span>
                    </div>
                    <div className="val" style={{ fontSize: 26 }}>AED {analytics.codSummary.pending}</div>
                </div>
                <div className="kpi">
                    <div className="kt">
                        <span className="lab">Collected COD</span>
                        <span className="ic"><span className="material-symbols-outlined text-[18px]">account_balance_wallet</span></span>
                    </div>
                    <div className="val" style={{ fontSize: 26 }}>AED {analytics.codSummary.collected}</div>
                </div>
                <div className="kpi accent">
                    <div className="kt">
                        <span className="lab">Remitted to You</span>
                        <span className="ic"><span className="material-symbols-outlined text-[18px]">payments</span></span>
                    </div>
                    <div className="val" style={{ fontSize: 26 }}>AED {analytics.codSummary.remitted}</div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Daily Shipments Chart */}
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:border-border transition-all duration-300">
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
                                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={formatDate} />
                                    <Area
                                        type="monotone"
                                        dataKey="count"
                                        stroke={ACCENT}
                                        strokeWidth={2.5}
                                        fillOpacity={1}
                                        fill="url(#colorShipmentsCustomer)"
                                        name="Shipments"
                                        activeDot={{ r: 5, fill: 'var(--card)', stroke: ACCENT, strokeWidth: 2.5 }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Monthly Comparison Chart */}
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:border-border transition-all duration-300">
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
                                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                                    <XAxis
                                        dataKey="month"
                                        tickFormatter={formatMonth}
                                        tick={AXIS_TICK}
                                        stroke={GRID}
                                        tickLine={false}
                                    />
                                    <YAxis tick={AXIS_TICK} stroke={GRID} tickLine={false} axisLine={false} width={36} />
                                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={formatMonth} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={34} name="Shipments">
                                        {analytics.monthlyComparison.map((_entry, index) => (
                                            <Cell
                                                key={`m-${index}`}
                                                fill={index === analytics.monthlyComparison.length - 1 ? ACCENT : INK_BAR}
                                                fillOpacity={index === analytics.monthlyComparison.length - 1 ? 1 : 0.82}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                {/* Distribution by City */}
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:border-border transition-all duration-300">
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
                                        dataKey="count"
                                        nameKey="city"
                                    >
                                        {analytics.distributionByCity.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:border-border transition-all duration-300">
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
                    </div>
                </div>
            </div>

            {/* Average Delivery Time by Route */}
            {analytics.deliveryTimeByRoute.length > 0 && (
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm hover:border-border transition-all duration-300">
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
                                        width={140}
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
                                                <span className="pill">{route.count}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--st-blue)' }}>
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


