import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  clientName: string;
  billingAddress: string | null;
  billingEmail: string | null;
  issueDate: Date;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  subtotal: string;
  tax: string; // Can be taxes from DB
  total: string;
  amountPaid: string;
  balance: string;
  status: string;
  currency: string;
  items: InvoiceItem[];
  adjustmentNotes?: string | null;
  isAdjusted?: boolean;
  lastAdjustedAt?: Date | null;
}

export function generateInvoicePDF(invoice: Invoice): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Colors
  const primaryColor = '#0A1628';
  const accentColor = '#0066FF';
  const textGray = '#4B5563';
  
  // Header background
  doc.setFillColor(10, 22, 40);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Company logo/name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('PATHXPRESS', 15, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('FZCO - Dubai, UAE', 15, 28);
  doc.text('Email: info@pathxpress.net', 15, 34);
  doc.text('Phone: +971 522803433', 15, 40);
  
  // Invoice title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', pageWidth - 15, 20, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text(`#${invoice.invoiceNumber}`, pageWidth - 15, 28, { align: 'right' });
  
  // Generate barcode for invoice number
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, invoice.invoiceNumber, {
    format: 'CODE128',
    width: 2,
    height: 40,
    displayValue: false,
    margin: 0
  });
  const barcodeDataUrl = canvas.toDataURL('image/png');
  doc.addImage(barcodeDataUrl, 'PNG', pageWidth - 60, 32, 45, 10);
  
  // Client information section
  let yPos = 60;
  
  doc.setTextColor(10, 22, 40);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 15, yPos);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  yPos += 7;
  doc.text(invoice.clientName, 15, yPos);
  
  if (invoice.billingAddress) {
    yPos += 5;
    const addressLines = doc.splitTextToSize(invoice.billingAddress, 80);
    doc.text(addressLines, 15, yPos);
    yPos += addressLines.length * 5;
  }
  
  if (invoice.billingEmail) {
    yPos += 5;
    doc.text(invoice.billingEmail, 15, yPos);
  }
  
  // Invoice details section
  const detailsX = pageWidth - 80;
  let detailsY = 60;
  
  doc.setTextColor(10, 22, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  doc.text('Invoice Date:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text(new Date(invoice.issueDate).toLocaleDateString('en-GB'), detailsX + 35, detailsY);
  
  detailsY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  doc.text('Due Date:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text(new Date(invoice.dueDate).toLocaleDateString('en-GB'), detailsX + 35, detailsY);
  
  detailsY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  doc.text('Period:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  const periodText = `${new Date(invoice.periodStart).toLocaleDateString('en-GB')} - ${new Date(invoice.periodEnd).toLocaleDateString('en-GB')}`;
  doc.text(periodText, detailsX + 35, detailsY);
  
  detailsY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  doc.text('Status:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  
  // Status badge
  const statusText = invoice.status.toUpperCase();
  let statusColor: [number, number, number] = [75, 85, 99];
  if (invoice.status === 'paid') {
    statusColor = [34, 197, 94]; // green
  } else if (invoice.status === 'overdue') {
    statusColor = [239, 68, 68]; // red
  } else if (invoice.status === 'pending') {
    statusColor = [251, 191, 36]; // yellow
  }
  
  doc.setTextColor(...statusColor);
  doc.text(statusText, detailsX + 35, detailsY);
  
  // Items table
  yPos = Math.max(yPos, detailsY) + 20;
  
  // Table header
  doc.setFillColor(0, 102, 255);
  doc.rect(15, yPos - 5, pageWidth - 30, 8, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DESCRIPTION', 17, yPos);
  doc.text('QTY', pageWidth - 80, yPos, { align: 'right' });
  doc.text('UNIT PRICE', pageWidth - 55, yPos, { align: 'right' });
  doc.text('AMOUNT', pageWidth - 17, yPos, { align: 'right' });
  
  yPos += 8;
  
  // Table rows
  doc.setTextColor(75, 85, 99);
  doc.setFont('helvetica', 'normal');
  
  // Calculate if there's an adjustment
  let adjustmentAmount = 0;
  if (invoice.isAdjusted && invoice.items.length > 0) {
    // Calculate original subtotal from items
    const itemsTotal = invoice.items.reduce((sum, item) => sum + parseFloat(item.amount), 0);
    const currentSubtotal = parseFloat(invoice.subtotal);
    adjustmentAmount = currentSubtotal - itemsTotal;
  }
  
  invoice.items.forEach((item, index) => {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    // Alternate row background
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
    }
    
    const descLines = doc.splitTextToSize(item.description, 90);
    doc.text(descLines, 17, yPos);
    doc.text(item.quantity.toString(), pageWidth - 80, yPos, { align: 'right' });
    doc.text(`${invoice.currency} ${parseFloat(item.unitPrice).toFixed(2)}`, pageWidth - 55, yPos, { align: 'right' });
    doc.text(`${invoice.currency} ${parseFloat(item.amount).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
    
    yPos += Math.max(7, descLines.length * 5);
  });
  
  // Add adjustment item if applicable
  if (adjustmentAmount !== 0) {
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    const adjustmentIndex = invoice.items.length;
    if (adjustmentIndex % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
    }
    
    // Highlight adjustment row with orange tint
    doc.setFillColor(255, 237, 213); // Light orange
    doc.rect(15, yPos - 4, pageWidth - 30, 7, 'F');
    
    const adjustmentDesc = invoice.adjustmentNotes 
      ? `Price Adjustment: ${invoice.adjustmentNotes.substring(0, 80)}${invoice.adjustmentNotes.length > 80 ? '...' : ''}`
      : 'Price Adjustment';
    const descLines = doc.splitTextToSize(adjustmentDesc, 90);
    
    doc.setTextColor(234, 88, 12); // Orange text
    doc.setFont('helvetica', 'bold');
    doc.text(descLines, 17, yPos);
    doc.text('1', pageWidth - 80, yPos, { align: 'right' });
    doc.text(`${invoice.currency} ${adjustmentAmount.toFixed(2)}`, pageWidth - 55, yPos, { align: 'right' });
    doc.text(`${invoice.currency} ${adjustmentAmount.toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    
    yPos += Math.max(7, descLines.length * 5);
  }
  
  // Totals section
  yPos += 10;
  
  if (yPos > pageHeight - 50) {
    doc.addPage();
    yPos = 20;
  }
  
  const totalsX = pageWidth - 70;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  doc.text('Subtotal:', totalsX, yPos);
  doc.text(`${invoice.currency} ${parseFloat(invoice.subtotal).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
  
  yPos += 6;
  const taxAmount = invoice.tax || '0';
  doc.text('Tax (5%):', totalsX, yPos);
  doc.text(`${invoice.currency} ${parseFloat(taxAmount).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
  
  yPos += 6;
  doc.setDrawColor(200, 200, 200);
  doc.line(totalsX, yPos - 2, pageWidth - 15, yPos - 2);
  
  yPos += 4;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(10, 22, 40);
  doc.setFontSize(11);
  doc.text('Total:', totalsX, yPos);
  doc.text(`${invoice.currency} ${parseFloat(invoice.total).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
  
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(75, 85, 99);
  doc.text('Amount Paid:', totalsX, yPos);
  doc.text(`${invoice.currency} ${parseFloat(invoice.amountPaid).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
  
  yPos += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 102, 255);
  doc.text('Balance Due:', totalsX, yPos);
  doc.text(`${invoice.currency} ${parseFloat(invoice.balance).toFixed(2)}`, pageWidth - 17, yPos, { align: 'right' });
  
  // Adjustment Notice (if applicable)
  if (invoice.isAdjusted && invoice.adjustmentNotes) {
    yPos += 15;
    
    // Draw orange box
    doc.setFillColor(255, 237, 213); // Light orange background
    doc.setDrawColor(251, 146, 60); // Orange border
    doc.roundedRect(15, yPos - 5, pageWidth - 30, 25, 2, 2, 'FD');
    
    // Adjustment title
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(194, 65, 12); // Dark orange
    doc.text('⚠ Invoice Adjustment Notice', 20, yPos + 2);
    
    // Adjustment notes
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(124, 45, 18); // Darker orange
    const splitNotes = doc.splitTextToSize(invoice.adjustmentNotes, pageWidth - 40);
    doc.text(splitNotes, 20, yPos + 8);
    
    // Adjustment date
    if (invoice.lastAdjustedAt) {
      const adjustedDate = invoice.lastAdjustedAt.toLocaleDateString();
      doc.setFontSize(8);
      doc.setTextColor(161, 98, 7);
      doc.text(`Adjusted on ${adjustedDate}`, 20, yPos + 17);
    }
    
    yPos += 30;
  }
  
  // Footer
  const footerY = pageHeight - 20;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Thank you for your business!', pageWidth / 2, footerY, { align: 'center' });
  doc.text('For any questions, please contact us at info@pathxpress.net', pageWidth / 2, footerY + 4, { align: 'center' });
  
  // Save the PDF
  doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
}
