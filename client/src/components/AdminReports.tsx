import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileSpreadsheet, Building2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
    generateMonthlyOrdersPDF,
    generateOrdersExcel,
    generateCODReportPDF,
    generateCODExcel,
    downloadPDF,
    downloadExcel,
} from '@/lib/reportUtils';
import { format } from 'date-fns';

interface AdminReportsProps {
    token: string;
}

export default function AdminReports({ token }: AdminReportsProps) {
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [selectedClient, setSelectedClient] = useState<string>('all');
    const [isDownloading, setIsDownloading] = useState(false);

    // Generate month options (last 12 months)
    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const value = format(date, 'yyyy-MM');
        const label = format(date, 'MMMM yyyy');
        return { value, label };
    });

    // Fetch clients for filtering
    const { data: clients } = trpc.portal.admin.getClientsForReports.useQuery({ token });

    // Create a trpc client for imperative queries
    const utils = trpc.useUtils();

    // Download Monthly Report PDF
    const handleDownloadMonthlyPDF = async () => {
        setIsDownloading(true);
        try {
            const clientId = selectedClient === 'all' ? undefined : parseInt(selectedClient);
            const orders = await utils.portal.admin.getMonthlyReport.fetch({
                token,
                month: selectedMonth,
                clientId
            });

            if (!orders || orders.length === 0) {
                toast.error('No orders found for this period');
                return;
            }

            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            const companyName = selectedClient === 'all'
                ? 'All Clients'
                : clients?.find(c => c.id.toString() === selectedClient)?.companyName || 'Client';

            const doc = generateMonthlyOrdersPDF(orders, monthLabel, companyName);
            downloadPDF(doc, `Admin_Monthly_Report_${selectedMonth}.pdf`);
            toast.success('PDF downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate PDF');
        } finally {
            setIsDownloading(false);
        }
    };

    // Download Monthly Report Excel
    const handleDownloadMonthlyExcel = async () => {
        setIsDownloading(true);
        try {
            const clientId = selectedClient === 'all' ? undefined : parseInt(selectedClient);
            const orders = await utils.portal.admin.getMonthlyReport.fetch({
                token,
                month: selectedMonth,
                clientId
            });

            if (!orders || orders.length === 0) {
                toast.error('No orders found for this period');
                return;
            }

            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            const workbook = generateOrdersExcel(orders, monthLabel);
            downloadExcel(workbook, `Admin_Monthly_Report_${selectedMonth}.xlsx`);
            toast.success('Excel downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate Excel');
        } finally {
            setIsDownloading(false);
        }
    };

    // Download COD Report PDF
    const handleDownloadCODPDF = async () => {
        setIsDownloading(true);
        try {
            const clientId = selectedClient === 'all' ? undefined : parseInt(selectedClient);
            const codRecords = await utils.portal.admin.getCODReport.fetch({ token, clientId });

            if (!codRecords || codRecords.length === 0) {
                toast.error('No COD records found');
                return;
            }

            const companyName = selectedClient === 'all'
                ? 'All Clients'
                : clients?.find(c => c.id.toString() === selectedClient)?.companyName || 'Client';

            const doc = generateCODReportPDF(codRecords, companyName);
            downloadPDF(doc, `Admin_COD_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            toast.success('COD PDF downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate PDF');
        } finally {
            setIsDownloading(false);
        }
    };

    // Download COD Report Excel
    const handleDownloadCODExcel = async () => {
        setIsDownloading(true);
        try {
            const clientId = selectedClient === 'all' ? undefined : parseInt(selectedClient);
            const codRecords = await utils.portal.admin.getCODReport.fetch({ token, clientId });

            if (!codRecords || codRecords.length === 0) {
                toast.error('No COD records found');
                return;
            }

            const workbook = generateCODExcel(codRecords);
            downloadExcel(workbook, `Admin_COD_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast.success('COD Excel downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate Excel');
        } finally {
            setIsDownloading(false);
        }
    };

    // Download All Orders
    const handleDownloadAllOrdersPDF = async () => {
        setIsDownloading(true);
        try {
            const orders = await utils.portal.admin.getAllOrders.fetch({ token });

            if (!orders || orders.length === 0) {
                toast.error('No orders found');
                return;
            }

            const doc = generateMonthlyOrdersPDF(orders, 'All Time - All Clients', 'PATHXPRESS Admin');
            downloadPDF(doc, `Admin_All_Orders_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            toast.success('PDF downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate PDF');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadAllOrdersExcel = async () => {
        setIsDownloading(true);
        try {
            const orders = await utils.portal.admin.getAllOrders.fetch({ token });

            if (!orders || orders.length === 0) {
                toast.error('No orders found');
                return;
            }

            const workbook = generateOrdersExcel(orders, 'All Time - All Clients');
            downloadExcel(workbook, `Admin_All_Orders_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast.success('Excel downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate Excel');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Admin Reports & Exports</h2>

            {/* Filter Section */}
            <Card className="glass-strong border-purple-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-purple-400" />
                        Report Filters
                    </CardTitle>
                    <CardDescription>
                        Filter reports by client or view global data
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Select Client</label>
                            <Select value={selectedClient} onValueChange={setSelectedClient}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Clients</SelectItem>
                                    {clients?.map(client => (
                                        <SelectItem key={client.id} value={client.id.toString()}>
                                            {client.companyName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Select Month</label>
                            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {monthOptions.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Monthly Orders Report */}
                <Card className="glass-strong border-blue-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-400" />
                            Monthly Orders Report
                        </CardTitle>
                        <CardDescription>
                            Download monthly shipments report (filtered)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Current filter: <span className="font-semibold">
                                {selectedClient === 'all' ? 'All Clients' : clients?.find(c => c.id.toString() === selectedClient)?.companyName}
                            </span> - {monthOptions.find(m => m.value === selectedMonth)?.label}
                        </p>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleDownloadMonthlyPDF}
                                variant="outline"
                                className="flex-1"
                                disabled={isDownloading}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF
                            </Button>
                            <Button
                                onClick={handleDownloadMonthlyExcel}
                                variant="outline"
                                className="flex-1"
                                disabled={isDownloading}
                            >
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                Excel
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* COD Report */}
                <Card className="glass-strong border-yellow-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-yellow-400" />
                            COD Report
                        </CardTitle>
                        <CardDescription>
                            Download COD records (filtered by client)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Export COD transactions for{' '}
                            <span className="font-semibold">
                                {selectedClient === 'all' ? 'all clients' : clients?.find(c => c.id.toString() === selectedClient)?.companyName}
                            </span>
                        </p>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleDownloadCODPDF}
                                variant="outline"
                                className="flex-1"
                                disabled={isDownloading}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                PDF
                            </Button>
                            <Button
                                onClick={handleDownloadCODExcel}
                                variant="outline"
                                className="flex-1"
                                disabled={isDownloading}
                            >
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                Excel
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Export All Orders */}
            <Card className="glass-strong border-green-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Download className="h-5 w-5 text-green-400" />
                        Export All Orders (Global)
                    </CardTitle>
                    <CardDescription>
                        Download complete historical data for all clients
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Export all shipment records across all clients and all time periods
                    </p>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleDownloadAllOrdersPDF}
                            variant="outline"
                            className="flex-1"
                            disabled={isDownloading}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            PDF
                        </Button>
                        <Button
                            onClick={handleDownloadAllOrdersExcel}
                            variant="outline"
                            className="flex-1"
                            disabled={isDownloading}
                        >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
