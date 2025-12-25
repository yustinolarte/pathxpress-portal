
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

interface ShipmentData {
  waybillNumber: string;
  shipperName: string;
  shipperAddress: string;
  shipperCity: string;
  shipperCountry: string;
  shipperPhone: string;
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  emirate?: string | null;
  destinationCountry: string;
  pieces: number;
  weight: number | string;
  length?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  serviceType: string;
  status: string;
  createdAt: Date | string;
  pickupDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  codRequired?: number;
  codAmount?: string | null;
  codCurrency?: string | null;
  specialInstructions?: string | null;
}

// Logo as base64 (PathXpress logo)
const PATHXPRESS_LOGO_BASE64 = 'data:image/png;base64,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';

export async function generateWaybillPDF(shipment: ShipmentData) {
  // Set dimensions for standard shipping label (100mm x 150mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [100, 150],
  });

  // Constants
  const pageWidth = 100;
  const pageHeight = 150;
  const margin = 3;
  const contentWidth = pageWidth - (margin * 2);

  // Colors
  const primaryColor = '#1a1a1a';
  const accentRed = '#C8102E';
  const lightGray = '#f5f5f5';
  const codOrange = '#F59E0B';

  let currentY = margin;

  // Helper functions
  const drawLine = (y: number) => {
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, pageWidth - margin, y);
  };

  const drawFilledRect = (x: number, y: number, w: number, h: number, color: string) => {
    pdf.setFillColor(color);
    pdf.rect(x, y, w, h, 'F');
  };

  // ===== SECTION 1: HEADER (Logo + Waybill + Date) =====
  const headerHeight = 12;

  // Add logo
  try {
    pdf.addImage(PATHXPRESS_LOGO_BASE64, 'PNG', margin, currentY + 1, 35, 10);
  } catch (e) {
    // Fallback: draw text logo
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(primaryColor);
    pdf.text('PATH', margin, currentY + 7);
    pdf.setTextColor(accentRed);
    pdf.text('X', margin + 15, currentY + 7);
    pdf.setTextColor(primaryColor);
    pdf.text('PRESS', margin + 20, currentY + 7);
  }

  // Waybill number and date (right side)
  pdf.setTextColor(100, 100, 100);
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  const dateStr = new Date(shipment.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  pdf.text(dateStr, pageWidth - margin, currentY + 5, { align: 'right' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  pdf.text(shipment.waybillNumber, pageWidth - margin, currentY + 10, { align: 'right' });

  currentY += headerHeight;
  drawLine(currentY);

  // ===== SECTION 2: MAIN BARCODE =====
  currentY += 2;
  const barcodeHeight = 18;

  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: false,
      margin: 0
    });
    const barcodeDataUrl = canvas.toDataURL('image/png');
    pdf.addImage(barcodeDataUrl, 'PNG', margin + 10, currentY, contentWidth - 20, 14);

    // Waybill number under barcode
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(primaryColor);
    pdf.text(shipment.waybillNumber, pageWidth / 2, currentY + 17, { align: 'center' });
  } catch (error) {
    console.error('Barcode error', error);
  }

  currentY += barcodeHeight + 3;
  drawLine(currentY);

  // ===== SECTION 3: ROUTING CODE (VERY LARGE) =====
  currentY += 1;
  const routingHeight = 18;

  // Dark background for routing
  drawFilledRect(margin, currentY, contentWidth * 0.65, routingHeight, primaryColor);

  // Routing text
  const serviceCode = shipment.serviceType === 'SDD' ? 'SDD' : 'DOM';
  const cityCode = shipment.city.substring(0, 3).toUpperCase();

  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(`${cityCode}`, margin + 8, currentY + 13);

  pdf.setFontSize(14);
  pdf.text(serviceCode, margin + 35, currentY + 13);

  // QR Code (right side)
  const qrSize = 16;
  const qrX = pageWidth - margin - qrSize - 2;
  const qrY = currentY + 1;

  try {
    const trackingUrl = `https://pathxpress.net/track/${shipment.waybillNumber}`;
    const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      width: 150,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch (e) {
    // Fallback: draw placeholder
    pdf.setDrawColor(200);
    pdf.rect(qrX, qrY, qrSize, qrSize);
    pdf.setFontSize(5);
    pdf.setTextColor(150);
    pdf.text('SCAN TO', qrX + qrSize / 2, qrY + qrSize / 2 - 1, { align: 'center' });
    pdf.text('TRACK', qrX + qrSize / 2, qrY + qrSize / 2 + 2, { align: 'center' });
  }

  currentY += routingHeight + 2;
  drawLine(currentY);

  // ===== SECTION 4: CONSIGNEE (TO) =====
  currentY += 2;
  const consigneeHeight = 28;

  // "TO" label
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 100, 100);
  pdf.text('TO:', margin, currentY + 4);

  // Name (large)
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  pdf.text(shipment.customerName, margin + 8, currentY + 4);

  // Phone
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(shipment.customerPhone, margin + 8, currentY + 10);

  // Address
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(60, 60, 60);
  const fullAddress = `${shipment.address}`;
  const cityCountry = `${shipment.city}, ${shipment.destinationCountry}`;

  const addressLines = pdf.splitTextToSize(fullAddress, contentWidth - 10);
  pdf.text(addressLines, margin + 8, currentY + 16);

  pdf.setFont('helvetica', 'bold');
  pdf.text(cityCountry, margin + 8, currentY + 24);

  currentY += consigneeHeight;
  drawLine(currentY);

  // ===== SECTION 5: PIECES / WEIGHT / COD =====
  currentY += 2;
  const infoHeight = 20;
  const isCOD = shipment.codRequired === 1;

  // Pieces and Weight (left side)
  const boxWidth = 28;
  const boxHeight = 16;

  // Pieces box
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, currentY, boxWidth, boxHeight);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100);
  pdf.text('PIECES', margin + boxWidth / 2, currentY + 4, { align: 'center' });
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  pdf.text(shipment.pieces.toString(), margin + boxWidth / 2, currentY + 12, { align: 'center' });

  // Weight box
  pdf.rect(margin + boxWidth + 2, currentY, boxWidth, boxHeight);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100);
  pdf.text('WEIGHT (KG)', margin + boxWidth + 2 + boxWidth / 2, currentY + 4, { align: 'center' });
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  pdf.text(shipment.weight.toString(), margin + boxWidth + 2 + boxWidth / 2, currentY + 12, { align: 'center' });

  // COD section (right side) - only if COD
  if (isCOD && shipment.codAmount) {
    const codBoxWidth = 35;
    const codX = pageWidth - margin - codBoxWidth;

    // Orange background for COD
    drawFilledRect(codX, currentY, codBoxWidth, boxHeight, codOrange);

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('COD', codX + codBoxWidth / 2, currentY + 4, { align: 'center' });

    pdf.setFontSize(12);
    const codAmount = parseFloat(shipment.codAmount).toFixed(2);
    pdf.text(`${codAmount}`, codX + codBoxWidth / 2, currentY + 10, { align: 'center' });

    pdf.setFontSize(7);
    pdf.text(shipment.codCurrency || 'AED', codX + codBoxWidth / 2, currentY + 14, { align: 'center' });
  } else {
    // Prepaid label
    const ppdX = pageWidth - margin - 25;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('PREPAID', ppdX + 12, currentY + 10, { align: 'center' });
  }

  currentY += infoHeight;
  drawLine(currentY);

  // ===== SECTION 6: SPECIAL INSTRUCTIONS (if any) =====
  if (shipment.specialInstructions) {
    currentY += 2;
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100);
    pdf.text('INSTRUCTIONS:', margin, currentY + 3);

    pdf.setFontSize(7);
    pdf.setTextColor(60);
    const instructions = pdf.splitTextToSize(shipment.specialInstructions, contentWidth - 5);
    pdf.text(instructions.slice(0, 2), margin + 20, currentY + 3); // Max 2 lines

    currentY += 10;
    drawLine(currentY);
  }

  // ===== SECTION 7: SHIPPER (FROM) - Compact =====
  currentY += 2;
  const shipperHeight = 12;

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100);
  pdf.text('FROM:', margin, currentY + 3);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(primaryColor);
  pdf.text(shipment.shipperName, margin + 12, currentY + 3);

  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80);
  pdf.text(`${shipment.shipperPhone}  •  ${shipment.shipperCity}, ${shipment.shipperCountry}`, margin + 12, currentY + 8);

  currentY += shipperHeight;
  drawLine(currentY);

  // ===== SECTION 8: FOOTER (Barcode + Contact) =====
  const footerY = pageHeight - 22;

  // Bottom barcode
  try {
    const canvas2 = document.createElement('canvas');
    JsBarcode(canvas2, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2,
      height: 35,
      displayValue: true,
      fontSize: 10,
      margin: 0,
      textMargin: 1
    });
    const b2Url = canvas2.toDataURL('image/png');
    pdf.addImage(b2Url, 'PNG', margin + 15, footerY, contentWidth - 30, 14);
  } catch (e) { /* ignore */ }

  // Contact info at very bottom
  pdf.setFontSize(6);
  pdf.setTextColor(120);
  pdf.setFont('helvetica', 'normal');
  pdf.text('pathxpress.net  •  +971 522803433  •  support@pathxpress.net', pageWidth / 2, pageHeight - 3, { align: 'center' });

  // Save
  pdf.save(`waybill-${shipment.waybillNumber}.pdf`);
}
