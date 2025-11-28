import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
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

interface CustomerReportsProps {
    token: string;
    companyName: string;
}

export default function CustomerReports({ token, companyName }: CustomerReportsProps) {
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [isDownloading, setIsDownloading] = useState(false);

    // Generate month options (last 12 months)
    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const value = format(date, 'yyyy-MM');
        const label = format(date, 'MMMM yyyy');
        return { value, label };
    });

    // Create a trpc client for imperative queries
    const utils = trpc.useUtils();

    // Download Monthly Report PDF
    const handleDownloadMonthlyPDF = async () => {
        setIsDownloading(true);
        try {
            const orders = await utils.portal.customer.getMonthlyReport.fetch({
                token,
                month: selectedMonth
            });

            if (!orders || orders.length === 0) {
                toast.error('No orders found for this month');
                return;
            }

            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            const doc = generateMonthlyOrdersPDF(orders, monthLabel, companyName);
            downloadPDF(doc, `Monthly_Report_${selectedMonth}.pdf`);
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
            const orders = await utils.portal.customer.getMonthlyReport.fetch({
                token,
                month: selectedMonth
            });

            if (!orders || orders.length === 0) {
                toast.error('No orders found for this month');
                return;
            }

            const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
            const workbook = generateOrdersExcel(orders, monthLabel);
            downloadExcel(workbook, `Monthly_Report_${selectedMonth}.xlsx`);
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
            const codRecords = await utils.portal.customer.getCODReport.fetch({ token });

            if (!codRecords || codRecords.length === 0) {
                toast.error('No COD records found');
                return;
            }

            const doc = generateCODReportPDF(codRecords, companyName);
            downloadPDF(doc, `COD_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
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
            const codRecords = await utils.portal.customer.getCODReport.fetch({ token });

            if (!codRecords || codRecords.length === 0) {
                toast.error('No COD records found');
                return;
            }

            const workbook = generateCODExcel(codRecords);
            downloadExcel(workbook, `COD_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            toast.success('COD Excel downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate Excel');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold">Reports & Exports</h2>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Monthly Orders Report */}
                <Card className="glass-strong border-blue-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-blue-400" />
                            Monthly Orders Report
                        </CardTitle>
                        <CardDescription>
                            Download your monthly shipments report
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                            Download all your COD (Cash on Delivery) records
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Export all COD transactions including pending and collected amounts
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
                        Export All Orders
                    </CardTitle>
                    <CardDescription>
                        Download all your historical shipment records
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Export your complete shipment history to PDF or Excel
                    </p>

                    <div className="flex gap-2">
                        <Button
                            onClick={async () => {
                                setIsDownloading(true);
                                try {
                                    const currentDate = new Date();
                                    const orders = await utils.portal.customer.getMyOrders.fetch({ token });

                                    if (!orders || orders.length === 0) {
                                        toast.error('No orders found');
                                        return;
                                    }

                                    const doc = generateMonthlyOrdersPDF(orders, 'All Time', companyName);
                                    downloadPDF(doc, `All_Orders_${format(currentDate, 'yyyy-MM-dd')}.pdf`);
                                    toast.success('PDF downloaded successfully');
                                } catch (error: any) {
                                    toast.error(error.message || 'Failed to generate PDF');
                                } finally {
                                    setIsDownloading(false);
                                }
                            }}
                            variant="outline"
                            className="flex-1"
                            disabled={isDownloading}
                        >
                            <FileText className="mr-2 h-4 w-4" />
                            PDF
                        </Button>
                        <Button
                            onClick={async () => {
                                setIsDownloading(true);
                                try {
                                    const currentDate = new Date();
                                    const orders = await utils.portal.customer.getMyOrders.fetch({ token });

                                    if (!orders || orders.length === 0) {
                                        toast.error('No orders found');
                                        return;
                                    }

                                    const workbook = generateOrdersExcel(orders, 'All Time');
                                    downloadExcel(workbook, `All_Orders_${format(currentDate, 'yyyy-MM-dd')}.xlsx`);
                                    toast.success('Excel downloaded successfully');
                                } catch (error: any) {
                                    toast.error(error.message || 'Failed to generate Excel');
                                } finally {
                                    setIsDownloading(false);
                                }
                            }}
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
