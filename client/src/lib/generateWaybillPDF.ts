
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

// Function to load image and convert to base64
async function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

export async function generateWaybillPDF(shipment: ShipmentData) {
  // Standard shipping label (100mm x 150mm)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [100, 150],
  });

  const pageWidth = 100;
  const pageHeight = 150;
  const margin = 4;
  const contentWidth = pageWidth - (margin * 2);

  // Colors
  const borderBlue = '#2563EB';
  const black = '#000000';
  const darkGray = '#374151';
  const mediumGray = '#6B7280';
  const lightGray = '#9CA3AF';

  // Draw blue border around the entire label
  pdf.setDrawColor(borderBlue);
  pdf.setLineWidth(2);
  pdf.rect(1, 1, pageWidth - 2, pageHeight - 2);

  let y = margin + 2;

  // ===== HEADER: Logo + QR Code =====

  // Try to load the logo
  try {
    const logoBase64 = await loadImageAsBase64('/pathxpress-logo.png');
    pdf.addImage(logoBase64, 'PNG', margin + 2, y, 40, 12);
  } catch (e) {
    // Fallback: Text logo
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(darkGray);
    pdf.text('PATH', margin + 2, y + 8);
    pdf.setTextColor('#DC2626');
    pdf.text('X', margin + 20, y + 8);
    pdf.setTextColor(darkGray);
    pdf.text('PRESS', margin + 24, y + 8);
  }

  // QR Code (top right)
  const qrSize = 18;
  const qrX = pageWidth - margin - qrSize - 2;

  try {
    const trackingUrl = `https://pathxpress.net/track/${shipment.waybillNumber}`;
    const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
      width: 150,
      margin: 0,
      color: { dark: '#000000', light: '#ffffff' }
    });
    pdf.addImage(qrDataUrl, 'PNG', qrX, y, qrSize, qrSize);
  } catch (e) {
    pdf.setDrawColor(200);
    pdf.rect(qrX, y, qrSize, qrSize);
  }

  y += 22;

  // Separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== SHIPPER (FROM) Section =====
  y += 3;

  pdf.setFillColor(245, 245, 245);
  pdf.rect(margin, y, contentWidth, 18, 'F');

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(lightGray);
  pdf.text('FROM / SHIPPER', margin + 2, y + 4);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(shipment.shipperName, margin + 2, y + 9);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(mediumGray);
  pdf.text(shipment.shipperPhone, margin + 2, y + 13);
  pdf.text(`${shipment.shipperCity}, ${shipment.shipperCountry}`, margin + 2, y + 16.5);

  y += 20;
  pdf.setDrawColor(200);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== CONSIGNEE (TO) Section =====
  y += 3;

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(lightGray);
  pdf.text('TO / CONSIGNEE', margin + 2, y + 4);

  // Customer name (large)
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(shipment.customerName, margin + 2, y + 10);

  // Phone
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(darkGray);
  pdf.text(shipment.customerPhone, margin + 2, y + 16);

  // Address
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(mediumGray);
  const addressLines = pdf.splitTextToSize(shipment.address, contentWidth - 35);
  pdf.text(addressLines.slice(0, 2), margin + 2, y + 22);

  // City (bold)
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(`${shipment.city}, ${shipment.destinationCountry}`, margin + 2, y + 30);

  // ROUTING CODE (right side - large city code)
  const routingX = pageWidth - margin - 25;
  const cityCode = shipment.city.substring(0, 3).toUpperCase();

  pdf.setFillColor(darkGray);
  pdf.rect(routingX, y, 23, 28, 'F');

  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(cityCode, routingX + 11.5, y + 18, { align: 'center' });

  y += 34;
  pdf.setDrawColor(200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== PACKAGE INFO + COD =====
  y += 3;

  // Info grid - 4 columns
  const colWidth = contentWidth / 4;

  // Pieces
  pdf.setDrawColor(180);
  pdf.rect(margin, y, colWidth, 16);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(lightGray);
  pdf.text('PIECES', margin + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(shipment.pieces.toString(), margin + colWidth / 2, y + 12, { align: 'center' });

  // Weight
  pdf.rect(margin + colWidth, y, colWidth, 16);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(lightGray);
  pdf.text('WEIGHT', margin + colWidth + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  const weightVal = typeof shipment.weight === 'string' ? parseFloat(shipment.weight) : shipment.weight;
  pdf.text(`${weightVal.toFixed(1)}`, margin + colWidth + colWidth / 2, y + 12, { align: 'center' });

  // Service Type
  const serviceType = shipment.serviceType === 'SDD' ? 'SDD' : 'DOM';
  pdf.rect(margin + colWidth * 2, y, colWidth, 16);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(lightGray);
  pdf.text('SERVICE', margin + colWidth * 2 + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(serviceType === 'SDD' ? '#EA580C' : '#2563EB');
  pdf.text(serviceType, margin + colWidth * 2 + colWidth / 2, y + 12, { align: 'center' });

  // COD or Date
  pdf.rect(margin + colWidth * 3, y, colWidth, 16);

  if (shipment.codRequired === 1 && shipment.codAmount) {
    pdf.setFillColor('#EA580C');
    pdf.rect(margin + colWidth * 3, y, colWidth, 16, 'F');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('COD', margin + colWidth * 3 + colWidth / 2, y + 4, { align: 'center' });
    pdf.setFontSize(10);
    const codAmount = parseFloat(shipment.codAmount).toFixed(0);
    pdf.text(`${codAmount}`, margin + colWidth * 3 + colWidth / 2, y + 12, { align: 'center' });
  } else {
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(lightGray);
    pdf.text('STATUS', margin + colWidth * 3 + colWidth / 2, y + 4, { align: 'center' });
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#16A34A');
    pdf.text('PREPAID', margin + colWidth * 3 + colWidth / 2, y + 12, { align: 'center' });
  }

  y += 18;

  // ===== SPECIAL INSTRUCTIONS =====
  if (shipment.specialInstructions && shipment.specialInstructions.trim()) {
    pdf.setFillColor(254, 249, 195);
    pdf.rect(margin, y, contentWidth, 10, 'F');
    pdf.setDrawColor(250, 204, 21);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, contentWidth, 10);

    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor('#92400E');
    pdf.text('INSTRUCTIONS:', margin + 2, y + 4);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    const instrLines = pdf.splitTextToSize(shipment.specialInstructions, contentWidth - 28);
    pdf.text(instrLines.slice(0, 1).join(' '), margin + 22, y + 4);

    y += 12;
  }

  // ===== MAIN BARCODE =====
  y = pageHeight - 32;

  pdf.setDrawColor(200);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y - 2, pageWidth - margin, y - 2);

  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2.5,
      height: 55,
      displayValue: true,
      fontSize: 14,
      fontOptions: 'bold',
      margin: 0,
      textMargin: 3
    });
    const barcodeUrl = canvas.toDataURL('image/png');
    pdf.addImage(barcodeUrl, 'PNG', margin + 8, y, contentWidth - 16, 22);
  } catch (e) {
    console.error('Barcode error:', e);
  }

  // Footer
  pdf.setFontSize(5);
  pdf.setTextColor(lightGray);
  pdf.setFont('helvetica', 'normal');
  pdf.text('pathxpress.net  |  +971 522803433  |  support@pathxpress.net', pageWidth / 2, pageHeight - 4, { align: 'center' });

  // Save
  pdf.save(`waybill-${shipment.waybillNumber}.pdf`);
}
