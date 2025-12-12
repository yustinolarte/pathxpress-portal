import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, DollarSign, Download, CreditCard, FileText } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { usePortalAuth } from '@/hooks/usePortalAuth';
import { toast } from 'sonner';

interface RemittanceDetailsDialogProps {
    remittanceId: number | null;
    isOpen: boolean;
    onClose: () => void;
    isAdmin?: boolean;
}

export default function RemittanceDetailsDialog({ remittanceId, isOpen, onClose, isAdmin = false }: RemittanceDetailsDialogProps) {
    const { token } = usePortalAuth();

    const { data: details, isLoading } = trpc.portal.cod.getRemittanceDetails.useQuery(
        { token: token || '', remittanceId: remittanceId || 0 },
        { enabled: !!token && !!remittanceId && isOpen }
    );

    const formatDate = (date: string | Date | null) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString();
    };

    const formatCurrency = (amount: string, currency: string) => {
        return `${currency} ${parseFloat(amount).toFixed(2)}`;
    };

    const handleDownloadPDF = async () => {
        if (!details) return;

        try {
            const { generateRemittancePDF, downloadPDF } = await import('@/lib/reportUtils');
            const doc = generateRemittancePDF(details.remittance, details.items);
            downloadPDF(doc, `Remittance_${details.remittance.remittanceNumber}.pdf`);
            toast.success('Remittance PDF downloaded successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to generate PDF');
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <DialogTitle className="text-2xl flex items-center gap-2">
                                <FileText className="h-6 w-6 text-primary" />
                                Remittance Details
                            </DialogTitle>
                            <DialogDescription>
                                Reference: {details?.remittance.remittanceNumber}
                            </DialogDescription>
                        </div>
                        {details && (
                            <Badge variant={
                                details.remittance.status === 'completed' ? 'default' :
                                    details.remittance.status === 'processed' ? 'secondary' : 'outline'
                            }>
                                {details.remittance.status.toUpperCase()}
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                {isLoading ? (
                    <div className="py-8 text-center text-muted-foreground">Loading details...</div>
                ) : !details ? (
                    <div className="py-8 text-center text-muted-foreground">Details not found</div>
                ) : (
                    <div className="space-y-6">
                        {/* Overview Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-muted/40 rounded-lg border">
                                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                                    <DollarSign className="h-4 w-4" /> Total Amount
                                </div>
                                <div className="text-xl font-bold">
                                    {formatCurrency(details.remittance.totalAmount, details.remittance.currency)}
                                </div>
                            </div>
                            <div className="p-4 bg-muted/40 rounded-lg border">
                                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                                    <CreditCard className="h-4 w-4" /> Payment Method
                                </div>
                                <div className="text-xl font-medium">
                                    {details.remittance.paymentMethod || 'Not specified'}
                                </div>
                                {details.remittance.paymentReference && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Ref: {details.remittance.paymentReference}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-muted/40 rounded-lg border">
                                <div className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                                    <Calendar className="h-4 w-4" /> Dates
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Created:</span> {formatDate(details.remittance.createdAt)}
                                </div>
                                <div className="text-sm">
                                    <span className="text-muted-foreground">Processed:</span> {formatDate(details.remittance.processedDate)}
                                </div>
                            </div>
                        </div>

                        {/* Notes Section */}
                        {details.remittance.notes && (
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/50">
                                <h4 className="font-semibold text-sm mb-1 text-blue-800 dark:text-blue-300">Notes</h4>
                                <p className="text-sm text-blue-700 dark:text-blue-200">{details.remittance.notes}</p>
                            </div>
                        )}

                        {/* Shipments Table */}
                        <div>
                            <h3 className="font-semibold mb-3">Included Shipments ({details.items.length})</h3>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Waybill #</TableHead>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Amount</TableHead>
                                            <TableHead>Collected Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {details.items.map((item: any) => (
                                            <TableRow key={item.id}>
                                                <TableCell className="font-medium text-primary">
                                                    {item.codRecord.order.waybillNumber}
                                                </TableCell>
                                                <TableCell>{item.codRecord.order.customerName}</TableCell>
                                                <TableCell className="font-bold">
                                                    {formatCurrency(item.codRecord.codAmount, item.codRecord.codCurrency)}
                                                </TableCell>
                                                <TableCell>{formatDate(item.codRecord.collectedDate)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t">
                            <Button variant="outline" onClick={handleDownloadPDF}>
                                <Download className="mr-2 h-4 w-4" /> Download PDF
                            </Button>
                            <Button onClick={onClose}>Close</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
