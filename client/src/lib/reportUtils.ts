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

/**
 * Generate Remittance PDF
 */
export function generateRemittancePDF(remittance: any, items: any[]) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(41, 128, 185); // Blue color
    doc.text('PATHXPRESS', pageWidth / 2, 20, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text('REMITTANCE ADVICE', pageWidth / 2, 30, { align: 'center' });

    // Remittance Details Box
    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 40, pageWidth - 30, 35, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Remittance No:`, 20, 50);
    doc.text(`Date:`, 20, 56);
    doc.text(`Status:`, 20, 62);

    doc.text(`Total Amount:`, 110, 50);
    doc.text(`Payment Method:`, 110, 56);
    doc.text(`Reference:`, 110, 62);

    doc.setFont('helvetica', 'normal');
    doc.text(remittance.remittanceNumber, 50, 50);
    doc.text(format(new Date(remittance.createdAt), 'dd/MM/yyyy'), 50, 56);
    doc.text(remittance.status.toUpperCase(), 50, 62);

    doc.setFont('helvetica', 'bold');
    doc.text(`${parseFloat(remittance.totalAmount).toFixed(2)} ${remittance.currency}`, 145, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(remittance.paymentMethod || 'N/A', 145, 56);
    doc.text(remittance.paymentReference || '-', 145, 62);

    // Notes if any
    if (remittance.notes) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text(`Notes: ${remittance.notes}`, 20, 70);
    }

    // Shipments Table Header
    let yPos = 85;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(41, 128, 185);
    doc.setTextColor(255, 255, 255);
    doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');

    doc.text('Waybill Number', 20, yPos);
    doc.text('Customer', 60, yPos);
    doc.text('Collected Date', 120, yPos);
    doc.text('Amount', 160, yPos);

    doc.setTextColor(0, 0, 0);

    // Table Content
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    items.forEach((item, index) => {
        if (yPos > 270) {
            doc.addPage();
            yPos = 20;
            // Repeat header
            doc.setFillColor(41, 128, 185);
            doc.setTextColor(255, 255, 255);
            doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
            doc.setFont('helvetica', 'bold');
            doc.text('Waybill Number', 20, yPos);
            doc.text('Customer', 60, yPos);
            doc.text('Collected Date', 120, yPos);
            doc.text('Amount', 160, yPos);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            yPos += 8;
        }

        const zebraColor = index % 2 === 0 ? 255 : 250;
        doc.setFillColor(zebraColor, zebraColor, zebraColor);
        doc.rect(15, yPos - 5, pageWidth - 30, 7, 'F');

        doc.text(item.order?.waybillNumber || 'N/A', 20, yPos);
        doc.text((item.order?.customerName || 'N/A').substring(0, 25), 60, yPos);

        const dateStr = item.codRecord?.collectedDate
            ? format(new Date(item.codRecord.collectedDate), 'dd/MM/yyyy')
            : '-';
        doc.text(dateStr, 120, yPos);

        doc.setFont('helvetica', 'bold');
        doc.text(`${parseFloat(item.amount).toFixed(2)}`, 160, yPos);
        doc.setFont('helvetica', 'normal');

        yPos += 7;
    });

    // Total Footer with Fee Breakdown
    yPos += 5;
    doc.line(15, yPos, pageWidth - 15, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    // Gross Amount (before fees)
    const grossAmount = remittance.grossAmount ? parseFloat(remittance.grossAmount) : parseFloat(remittance.totalAmount);
    doc.text('Gross Amount (Total COD Collected):', 80, yPos);
    doc.text(`${grossAmount.toFixed(2)} ${remittance.currency}`, 165, yPos);

    // Fee Deduction (if available)
    if (remittance.feeAmount && parseFloat(remittance.feeAmount) > 0) {
        yPos += 7;
        const feeAmount = parseFloat(remittance.feeAmount);
        const feePercentage = remittance.feePercentage || '0';
        doc.setTextColor(220, 53, 69); // Red color for fee
        doc.text(`COD Service Fee (${feePercentage}%):`, 80, yPos);
        doc.text(`-${feeAmount.toFixed(2)} ${remittance.currency}`, 165, yPos);
        doc.setTextColor(0, 0, 0);
    }

    // Net Amount (to client)
    yPos += 10;
    doc.setFillColor(41, 128, 185);
    doc.setTextColor(255, 255, 255);
    doc.rect(75, yPos - 5, pageWidth - 90, 10, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Net Amount to Client:', 80, yPos + 2);
    doc.text(`${parseFloat(remittance.totalAmount).toFixed(2)} ${remittance.currency}`, 165, yPos + 2);
    doc.setTextColor(0, 0, 0);

    // Footer Info
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const footerY = doc.internal.pageSize.height - 15;
    doc.text('Thank you for choosing PATHXPRESS.', pageWidth / 2, footerY, { align: 'center' });
    doc.text('For any queries, please contact support@pathxpress.net', pageWidth / 2, footerY + 5, { align: 'center' });

    return doc;
}

export function downloadPDF(doc: jsPDF, filename: string) {
    doc.save(filename);
}

export function downloadExcel(workbook: XLSX.WorkBook, filename: string) {
    XLSX.writeFile(workbook, filename);
}

