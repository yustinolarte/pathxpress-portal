
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { FileSpreadsheet, Upload, Download, AlertCircle, CheckCircle, Save } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface BulkShipmentDialogProps {
    onSuccess: () => void;
    token: string;
}

export default function BulkShipmentDialog({ onSuccess, token }: BulkShipmentDialogProps) {
    const [open, setOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [shipperDetails, setShipperDetails] = useState<any>(null);
    const [resultsLog, setResultsLog] = useState<{ row: number, status: 'success' | 'error', message: string }[]>([]);

    // Fetch saved shippers to populate the dropdown
    const { data: savedShippers = [] } = trpc.portal.customer.getSavedShippers.useQuery({ token });

    const createMutation = trpc.portal.customer.createShipment.useMutation();

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setFile(file);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                setParsedData(data);
            } catch (err) {
                toast.error('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleDownloadTemplate = () => {
        const headers = [
            ['Customer Name', 'Customer Phone', 'Address', 'City', 'Weight', 'Service Type (DOM/SDD)', 'COD Amount', 'Instructions']
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(headers);
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'pathxpress_bulk_template.xlsx');
    };

    // Helper function to find a column value by multiple possible names (case-insensitive)
    const getColumnValue = (row: any, possibleNames: string[]): any => {
        // Get all keys from the row
        const rowKeys = Object.keys(row);

        for (const name of possibleNames) {
            // First try exact match
            if (row[name] !== undefined) return row[name];

            // Then try case-insensitive match
            const normalizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            for (const key of rowKeys) {
                const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (normalizedKey === normalizedName || normalizedKey.includes(normalizedName) || normalizedName.includes(normalizedKey)) {
                    return row[key];
                }
            }
        }
        return undefined;
    };

    const processUpload = async () => {
        if (!shipperDetails) {
            toast.error('Please select a shipper first');
            return;
        }

        setUploading(true);
        setResultsLog([]);
        let successCount = 0;
        let failCount = 0;
        const newLog: typeof resultsLog = [];

        // Debug: Log all column names from first row
        if (parsedData.length > 0) {
            console.log('[Bulk Import] Detected columns:', Object.keys(parsedData[0]));
            console.log('[Bulk Import] First row data:', parsedData[0]);
        }

        for (let i = 0; i < parsedData.length; i++) {
            const row = parsedData[i];
            try {
                // Get values using flexible column matching
                const customerName = getColumnValue(row, ['Customer Name', 'CustomerName', 'customer_name', 'Name', 'Consignee', 'Consignee Name']);
                const customerPhone = getColumnValue(row, ['Customer Phone', 'CustomerPhone', 'customer_phone', 'Phone', 'Mobile', 'Consignee Phone', 'Tel']);
                const address = getColumnValue(row, ['Address', 'Delivery Address', 'DeliveryAddress', 'Street', 'Full Address']);
                const city = getColumnValue(row, ['City', 'Destination City', 'DestinationCity', 'Town']);

                // Validation
                if (!customerName || !address || !city) {
                    throw new Error(`Missing required fields: ${!customerName ? 'Customer Name' : ''} ${!address ? 'Address' : ''} ${!city ? 'City' : ''}`);
                }

                // Service Type - flexible matching
                const serviceTypeRaw = getColumnValue(row, ['Service Type (DOM/SDD)', 'Service Type', 'ServiceType', 'service_type', 'Service', 'Type']);
                const serviceTypeUpper = String(serviceTypeRaw || '').trim().toUpperCase();
                const serviceType = serviceTypeUpper.includes('SDD') || serviceTypeUpper === 'SAME DAY' || serviceTypeUpper === 'SAMEDAY'
                    ? 'SDD'
                    : 'DOM';

                // Weight - flexible matching
                const weightRaw = getColumnValue(row, ['Weight (kg)', 'Weight(kg)', 'Weight', 'weight', 'Kg', 'KG', 'Peso', 'Weight (Kg)']);
                const weight = parseFloat(String(weightRaw || '').replace(/[^0-9.]/g, '')) || 1;

                // COD Amount - flexible matching
                const codAmountRaw = getColumnValue(row, ['COD Amount (AED)', 'COD Amount', 'COD', 'cod_amount', 'Cod Amount', 'cod', 'Cash on Delivery', 'COD Value', 'Amount (AED)']);
                const codAmountParsed = parseFloat(String(codAmountRaw || '').replace(/[^0-9.]/g, ''));
                const hasCOD = !isNaN(codAmountParsed) && codAmountParsed > 0;

                // Instructions - flexible matching
                const instructions = getColumnValue(row, ['Instructions', 'Special Instructions', 'SpecialInstructions', 'Notes', 'Comments', 'Remarks', 'Instrucciones']);

                console.log(`[Bulk Import] Row ${i + 1}: weight=${weight} (raw: "${weightRaw}"), serviceType=${serviceType} (raw: "${serviceTypeRaw}"), COD=${hasCOD ? codAmountParsed : 'none'} (raw: "${codAmountRaw}"), instructions="${instructions || 'none'}"`);

                await createMutation.mutateAsync({
                    token,
                    shipment: {
                        shipperName: String(shipperDetails.shipperName || ''),
                        shipperPhone: String(shipperDetails.shipperPhone || ''),
                        shipperAddress: String(shipperDetails.shipperAddress || ''),
                        shipperCity: String(shipperDetails.shipperCity || ''),
                        shipperCountry: String(shipperDetails.shipperCountry || 'UAE'),

                        customerName: String(customerName || ''),
                        customerPhone: String(customerPhone || ''),
                        address: String(address || ''),
                        city: String(city || ''),
                        destinationCountry: 'UAE',

                        weight: weight,
                        pieces: 1,
                        serviceType: serviceType,
                        specialInstructions: String(instructions || ''),

                        codRequired: hasCOD ? 1 : 0,
                        codAmount: hasCOD ? String(codAmountParsed) : undefined,
                        codCurrency: 'AED'
                    }
                });
                successCount++;
                newLog.push({ row: i + 1, status: 'success', message: `Created (${serviceType}, ${weight}kg${hasCOD ? ', COD: ' + codAmountParsed : ''})` });
            } catch (error: any) {
                console.error('[Bulk Import] Failed row', i + 1, row, error);
                failCount++;
                const errorMessage = error.message || error.shape?.message || 'Unknown error';
                newLog.push({ row: i + 1, status: 'error', message: errorMessage });
            }

            setProgress(Math.round(((i + 1) / parsedData.length) * 100));
        }

        setResultsLog(newLog);
        setUploading(false);
        toast.success(`Processed ${parsedData.length} records. Success: ${successCount}, Failed: ${failCount}`);

        if (successCount === parsedData.length) {
            setOpen(false);
            setParsedData([]);
            setFile(null);
            setProgress(0);
            onSuccess();
        }
    };

    const handleSelectShipper = (id: string) => {
        const shipper = savedShippers.find((s: any) => s.id.toString() === id);
        if (shipper) {
            setShipperDetails(shipper);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Bulk Upload
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl glass-strong max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-primary" />
                        Bulk Shipment Upload
                    </DialogTitle>
                    <DialogDescription>
                        Upload a spreadsheet to create multiple shipments at once.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Step 1: Select Shipper */}
                    <div className="space-y-2">
                        <Label>1. Select Shipper Details</Label>
                        <div className="flex gap-2">
                            <Select onValueChange={handleSelectShipper}>
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select a saved shipper to use" />
                                </SelectTrigger>
                                <SelectContent>
                                    {savedShippers.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id.toString()}>
                                            {s.nickname} ({s.shipperName})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {/* Fallback if no shippers */}
                            {savedShippers.length === 0 && (
                                <div className="text-xs text-muted-foreground flex items-center">
                                    <AlertCircle className="w-4 h-4 mr-1" /> No saved shippers. Please create one in the dashboard first.
                                </div>
                            )}
                        </div>
                        {shipperDetails && (
                            <div className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                                Using: <strong>{shipperDetails.shipperName}</strong> - {shipperDetails.shipperCity}
                            </div>
                        )}
                    </div>

                    {/* Step 2: Template */}
                    <div className="space-y-2">
                        <Label>2. Prepare Data</Label>
                        <div className="flex items-center justify-between bg-muted/20 p-3 rounded-lg border">
                            <div className="text-sm text-muted-foreground">
                                Download the template to ensure your data is formatted correctly.
                            </div>
                            <Button size="sm" variant="secondary" onClick={handleDownloadTemplate}>
                                <Download className="w-4 h-4 mr-2" />
                                Download Template
                            </Button>
                        </div>
                    </div>

                    {/* Step 3: Upload */}
                    <div className="space-y-2">
                        <Label>3. Upload File</Label>
                        <div className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center transition-colors ${file ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}>
                            {file ? (
                                <div className="text-center">
                                    <FileSpreadsheet className="w-8 h-8 text-primary mx-auto mb-2" />
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                                    <Button variant="ghost" size="sm" className="mt-2 text-destructive hover:text-destructive" onClick={() => { setFile(null); setParsedData([]); }}>
                                        Remove
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground mb-4">Drag and drop or click to upload .xlsx, .csv</p>
                                    <Input
                                        type="file"
                                        accept=".xlsx,.xls,.csv"
                                        onChange={handleFileUpload}
                                        className="hidden"
                                        id="file-upload"
                                    />
                                    <Button variant="secondary" onClick={() => document.getElementById('file-upload')?.click()}>
                                        Choose File
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Preview */}
                    {parsedData.length > 0 && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex items-center justify-between">
                                <Label>Preview ({parsedData.length} records)</Label>
                            </div>
                            <div className="border rounded-lg overflow-hidden max-h-[200px] overflow-y-auto text-xs">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>City</TableHead>
                                            <TableHead>Weight</TableHead>
                                            <TableHead>Service</TableHead>
                                            <TableHead>COD</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {parsedData.slice(0, 5).map((row, i) => {
                                            // Use getColumnValue for consistent matching
                                            const customerName = getColumnValue(row, ['Customer Name', 'CustomerName', 'customer_name', 'Name', 'Consignee', 'Consignee Name']);
                                            const city = getColumnValue(row, ['City', 'Destination City', 'DestinationCity', 'Town']);
                                            const weightRaw = getColumnValue(row, ['Weight (kg)', 'Weight(kg)', 'Weight', 'weight', 'Kg', 'KG', 'Peso', 'Weight (Kg)']);
                                            const weight = parseFloat(String(weightRaw || '').replace(/[^0-9.]/g, '')) || 1;

                                            const serviceTypeRaw = getColumnValue(row, ['Service Type (DOM/SDD)', 'Service Type', 'ServiceType', 'service_type', 'Service', 'Type']);
                                            const serviceTypeUpper = String(serviceTypeRaw || '').trim().toUpperCase();
                                            const serviceType = serviceTypeUpper.includes('SDD') || serviceTypeUpper === 'SAME DAY' || serviceTypeUpper === 'SAMEDAY' ? 'SDD' : 'DOM';

                                            const codAmountRaw = getColumnValue(row, ['COD Amount (AED)', 'COD Amount', 'COD', 'cod_amount', 'Cod Amount', 'cod', 'Cash on Delivery', 'COD Value', 'Amount (AED)']);
                                            const codAmountParsed = parseFloat(String(codAmountRaw || '').replace(/[^0-9.]/g, ''));
                                            const hasCOD = !isNaN(codAmountParsed) && codAmountParsed > 0;

                                            return (
                                                <TableRow key={i}>
                                                    <TableCell className="font-medium">{customerName || '-'}</TableCell>
                                                    <TableCell>{city || '-'}</TableCell>
                                                    <TableCell>{weight}kg</TableCell>
                                                    <TableCell>
                                                        <span className={serviceType === 'SDD' ? 'text-orange-500 font-medium' : ''}>
                                                            {serviceType}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {hasCOD ? (
                                                            <span className="text-green-500 font-medium">{codAmountParsed}</span>
                                                        ) : (
                                                            <span className="text-muted-foreground">-</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {parsedData.length > 5 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground py-2">
                                                    ...and {parsedData.length - 5} more
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {uploading && (
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs mb-1">
                                <span>Processing...</span>
                                <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                        </div>
                    )}

                    {/* Results Log */}
                    {resultsLog.length > 0 && (
                        <div className="space-y-2">
                            <Label>Processing Results</Label>
                            <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 text-xs space-y-1">
                                {resultsLog.filter(l => l.status === 'error').map((log, i) => (
                                    <div key={i} className="text-red-500 flex gap-2">
                                        <span className="font-semibold">Row {log.row}:</span>
                                        <span>{log.message}</span>
                                    </div>
                                ))}
                                {resultsLog.filter(l => l.status === 'error').length === 0 && (
                                    <div className="text-green-500 flex items-center gap-2">
                                        <CheckCircle className="w-4 h-4" /> All rows processed successfully.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancel</Button>
                    <Button
                        onClick={processUpload}
                        disabled={!file || parsedData.length === 0 || uploading || !shipperDetails}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {uploading ? (
                            <>Processing...</>
                        ) : (
                            <>
                                <Upload className="w-4 h-4 mr-2" />
                                Import {parsedData.length} Shipments
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
