import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

// Types for reports
export type Order = {
    id: number;
    waybillNumber: string;
    customerName: string;
    city: string;
    destinationCountry: string;
    serviceType: string;
    status: string;
    weight: number;
    createdAt: Date | string;
    deliveryDateReal?: Date | string | null;
    codRequired: number;
    codAmount?: string | null;
};

export type CODRecord = {
    id: number;
    waybillNumber: string;
    codAmount: string;
    codCurrency: string;
    status: string;
    collectedDate?: Date | string | null;
    remittedToClientDate?: Date | string | null;
    customerName: string;
    city: string;
};

/**
 * Generate Monthly Orders Report PDF
 */
export function generateMonthlyOrdersPDF(orders: Order[], month: string, companyName: string) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PATHXPRESS', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(16);
    doc.text('Monthly Orders Report', pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Company: ${companyName}`, 15, 35);
    doc.text(`Period: ${month}`, 15, 42);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, 49);

    // Summary
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
    const totalWeight = orders.reduce((sum, o) => sum + Number(o.weight || 0), 0);
    const totalCOD = orders
        .filter(o => o.codRequired === 1 && o.codAmount)
        .reduce((sum, o) => sum + parseFloat(o.codAmount || '0'), 0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary:', 15, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Orders: ${totalOrders}`, 15, 67);
    doc.text(`Delivered: ${deliveredOrders}`, 15, 74);
    doc.text(`Total Weight: ${totalWeight.toFixed(2)} kg`, 15, 81);
    doc.text(`Total COD: ${totalCOD.toFixed(2)} AED`, 15, 88);

    // Table header
    let yPos = 100;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Waybill', 15, yPos);
    doc.text('Customer', 50, yPos);
    doc.text('City', 100, yPos);
    doc.text('Service', 130, yPos);
    doc.text('Weight', 160, yPos);
    doc.text('Status', 180, yPos);

    // Draw line
    doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);

    // Table content
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    orders.forEach((order, index) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;

            // Repeat header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Waybill', 15, yPos);
            doc.text('Customer', 50, yPos);
            doc.text('City', 100, yPos);
            doc.text('Service', 130, yPos);
            doc.text('Weight', 160, yPos);
            doc.text('Status', 180, yPos);
            doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
            yPos += 8;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
        }

        doc.text(order.waybillNumber, 15, yPos);
        doc.text(order.customerName.substring(0, 20), 50, yPos);
        doc.text(order.city.substring(0, 15), 100, yPos);
        doc.text(order.serviceType, 130, yPos);
        doc.text(`${order.weight}kg`, 160, yPos);
        doc.text(order.status, 180, yPos);

        yPos += 6;
    });

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
        );
    }

    return doc;
}

/**
 * Generate Orders Excel
 */
export function generateOrdersExcel(orders: Order[], month: string) {
    const data = orders.map(order => ({
        'Waybill Number': order.waybillNumber,
        'Customer Name': order.customerName,
        'Destination': `${order.city}, ${order.destinationCountry}`,
        'Service Type': order.serviceType,
        'Weight (kg)': order.weight,
        'Status': order.status,
        'Created Date': format(new Date(order.createdAt), 'dd/MM/yyyy'),
        'Delivery Date': order.deliveryDateReal
            ? format(new Date(order.deliveryDateReal), 'dd/MM/yyyy')
            : 'N/A',
        'COD Required': order.codRequired === 1 ? 'Yes' : 'No',
        'COD Amount': order.codAmount || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

    // Auto-size columns
    const maxWidth = 20;
    const wscols = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = wscols;

    return workbook;
}

/**
 * Generate COD Report PDF
 */
export function generateCODReportPDF(codRecords: CODRecord[], companyName: string) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('PATHXPRESS', pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(16);
    doc.text('COD Collection Report', pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Company: ${companyName}`, 15, 35);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, 42);

    // Summary
    const totalCOD = codRecords.reduce((sum, r) => sum + parseFloat(r.codAmount || '0'), 0);
    const pendingCOD = codRecords
        .filter(r => r.status === 'pending_collection')
        .reduce((sum, r) => sum + parseFloat(r.codAmount || '0'), 0);
    const collectedCOD = codRecords
        .filter(r => r.status === 'collected' || r.status === 'remitted')
        .reduce((sum, r) => sum + parseFloat(r.codAmount || '0'), 0);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary:', 15, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total COD Records: ${codRecords.length}`, 15, 62);
    doc.text(`Total Amount: ${totalCOD.toFixed(2)} AED`, 15, 69);
    doc.text(`Pending: ${pendingCOD.toFixed(2)} AED`, 15, 76);
    doc.text(`Collected: ${collectedCOD.toFixed(2)} AED`, 15, 83);

    // Table header
    let yPos = 95;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Waybill', 15, yPos);
    doc.text('Customer', 50, yPos);
    doc.text('City', 100, yPos);
    doc.text('Amount', 130, yPos);
    doc.text('Status', 160, yPos);

    doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);

    // Table content
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    codRecords.forEach((record) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Waybill', 15, yPos);
            doc.text('Customer', 50, yPos);
            doc.text('City', 100, yPos);
            doc.text('Amount', 130, yPos);
            doc.text('Status', 160, yPos);
            doc.line(15, yPos + 2, pageWidth - 15, yPos + 2);
            yPos += 8;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
        }

        doc.text(record.waybillNumber, 15, yPos);
        doc.text(record.customerName.substring(0, 20), 50, yPos);
        doc.text(record.city.substring(0, 15), 100, yPos);
        doc.text(`${record.codAmount} ${record.codCurrency}`, 130, yPos);
        doc.text(record.status, 160, yPos);

        yPos += 6;
    });

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
        );
    }

    return doc;
}

/**
 * Generate COD Excel
 */
export function generateCODExcel(codRecords: CODRecord[]) {
    const data = codRecords.map(record => ({
        'Waybill Number': record.waybillNumber,
        'Customer Name': record.customerName,
        'City': record.city,
        'COD Amount': record.codAmount,
        'Currency': record.codCurrency,
        'Status': record.status,
        'Collected Date': record.collectedDate
            ? format(new Date(record.collectedDate), 'dd/MM/yyyy')
            : 'N/A',
        'Remitted Date': record.remittedToClientDate
            ? format(new Date(record.remittedToClientDate), 'dd/MM/yyyy')
            : 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'COD Records');

    const maxWidth = 20;
    const wscols = Object.keys(data[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = wscols;

    return workbook;
}

/**
 * Download helper functions for browser
 */
export function downloadPDF(doc: jsPDF, filename: string) {
    doc.save(filename);
}

export function downloadExcel(workbook: XLSX.WorkBook, filename: string) {
    XLSX.writeFile(workbook, filename);
}
