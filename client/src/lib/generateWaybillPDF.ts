
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';

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

export function generateWaybillPDF(shipment: ShipmentData) {
  // Set dimensions for standard shipping label (100mm x 150mm)
  // This ensures it prints correctly on thermal printers and looks right on screen.
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [100, 150], // Custom size: 100mm width, 150mm height
  });

  // Label Constants (Fits within 100x150 with 2mm margins)
  const startX = 2;
  const startY = 2;
  const labelWidth = 96;
  const labelHeight = 146;

  // Helper to draw borders
  const drawBorder = (y: number, h: number) => {
    pdf.rect(startX, y, labelWidth, h);
  };

  // --- 1. Top Bar (Ref & Date) ---
  let currentY = startY;
  const row1Height = 5;

  pdf.setLineWidth(0.1);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);

  const dateStr = new Date(shipment.createdAt).toISOString().split('T')[0];

  pdf.text(`RefNo: ${shipment.waybillNumber}`, startX + 1, currentY + 3.5);
  pdf.text(`ShipDate:${dateStr}`, startX + labelWidth - 25, currentY + 3.5);

  drawBorder(currentY, row1Height);
  currentY += row1Height;

  // --- 2. Header (Logo & Main Barcode) ---
  const row2Height = 20; // Reduced from 22

  // Left: Logo (Moving further left)
  const logoStartX = startX + 1;

  // "PATH"
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text('PATH', logoStartX, currentY + 12);

  // "X" (Adjusted spacing to look connected)
  pdf.setTextColor(220, 38, 38);
  pdf.setFontSize(26);
  pdf.text('X', logoStartX + 17, currentY + 12); // moved closer

  // "PRESS"
  pdf.setTextColor(30, 30, 30);
  pdf.setFontSize(20);
  pdf.text('PRESS', logoStartX + 24, currentY + 12); // moved closer

  // Reset Color
  pdf.setTextColor(0, 0, 0);

  // Right: Barcode
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2,
      height: 40,
      displayValue: false,
      margin: 0
    });
    const barcodeDataUrl = canvas.toDataURL('image/png');

    // Position at X=60
    pdf.addImage(barcodeDataUrl, 'PNG', startX + 58, currentY + 4, 38, 12);

    // Draw text manually for crispness
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(shipment.waybillNumber, startX + 77, currentY + 19, { align: 'center' }); // moved up slightly
  } catch (error) {
    console.error('Barcode error', error);
  }

  drawBorder(currentY, row2Height);
  currentY += row2Height;

  // --- 3. Shipper Info ---
  const row3Height = 16;

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Shipper', startX + 2, currentY + 3);

  pdf.setFont('helvetica', 'normal');
  pdf.text(`${shipment.shipperName}  ${shipment.shipperPhone}`, startX + 2, currentY + 7);

  const shipperFullAddr = `${shipment.shipperAddress}, ${shipment.shipperCity}, ${shipment.shipperCountry}`;
  const splitShipperAddr = pdf.splitTextToSize(shipperFullAddr, labelWidth - 4);
  pdf.text(splitShipperAddr, startX + 2, currentY + 11);

  drawBorder(currentY, row3Height);
  currentY += row3Height;

  // --- 4. Consignee Info (To) ---
  const row4Height = 30; // Reduced from 32
  pdf.rect(startX, currentY, labelWidth, row4Height); // Main box
  pdf.line(startX + 70, currentY, startX + 70, currentY + row4Height); // Vertical divider

  // "To" Circle Icon
  pdf.setFillColor(0, 0, 0);
  pdf.circle(startX + 8, currentY + 12, 4, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('To', startX + 5.5, currentY + 13.5);
  pdf.setTextColor(0, 0, 0);

  pdf.setFontSize(10);
  pdf.text(shipment.customerName, startX + 16, currentY + 6);
  pdf.setFontSize(9);
  pdf.text(shipment.customerPhone, startX + 16, currentY + 11);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const consAddr = `${shipment.address}, ${shipment.city}, ${shipment.destinationCountry}`;
  const splitConsAddr = pdf.splitTextToSize(consAddr, 60);
  pdf.text(splitConsAddr, startX + 16, currentY + 16);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${shipment.city}`, startX + 10, currentY + row4Height - 3);

  // Routing QR Placeholder
  pdf.rect(startX + 75, currentY + 5, 20, 20);
  pdf.setFontSize(6);
  pdf.text('Routing QR', startX + 77, currentY + 15);
  pdf.setFontSize(8);
  pdf.text('Standard', startX + 75, currentY + 30);

  currentY += row4Height;

  // --- 5. Routing Code ---
  const row5Height = 14;
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  const serviceCode = shipment.serviceType === 'SDD' ? 'SDD' : 'DOM';
  const cityCode = shipment.city.substring(0, 3).toUpperCase();
  const routeText = `UAE   ${serviceCode}   ${cityCode}`;
  pdf.text(routeText, startX + labelWidth / 2, currentY + 10, { align: 'center' });
  drawBorder(currentY, row5Height);
  currentY += row5Height;

  // --- 6. Content & COD ---
  const row6Height = 20; // Reduced from 22
  pdf.rect(startX, currentY, labelWidth, row6Height);
  pdf.line(startX + 70, currentY, startX + 70, currentY + row6Height);

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const contentText = shipment.specialInstructions || `Package containing ${shipment.pieces} item(s)`;
  const splitContent = pdf.splitTextToSize(contentText, 68);
  pdf.text(splitContent, startX + 2, currentY + 5);

  const isCOD = shipment.codRequired === 1;
  const payType = isCOD ? 'COD' : 'PPD';
  const payAmount = isCOD && shipment.codAmount ? parseFloat(shipment.codAmount).toFixed(2) : '0.00';

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text(payType, startX + 72, currentY + 5);
  pdf.setFontSize(14);
  pdf.text(payAmount, startX + 85, currentY + 15, { align: 'center' });
  pdf.setFontSize(8);
  pdf.text('(AED)', startX + 85, currentY + 19, { align: 'center' });
  currentY += row6Height;

  // --- 7. Invoice & Grid ---
  // Condensed grid
  const row7Height = 5;
  drawBorder(currentY, row7Height);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Invoice Number: -`, startX + 2, currentY + 3.5);
  currentY += row7Height;

  const row8Height = 6;
  const colWidth = labelWidth / 4;
  pdf.rect(startX, currentY, labelWidth, row8Height);
  pdf.line(startX + colWidth, currentY, startX + colWidth, currentY + row8Height * 2);
  pdf.line(startX + colWidth * 2, currentY, startX + colWidth * 2, currentY + row8Height * 2);
  pdf.line(startX + colWidth * 3, currentY, startX + colWidth * 3, currentY + row8Height * 2);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('QTY', startX + 5, currentY + 4);
  pdf.text('Weight', startX + colWidth + 2, currentY + 4);
  pdf.text('Value', startX + colWidth * 2 + 2, currentY + 4);
  pdf.text('Pieces', startX + colWidth * 3 + 2, currentY + 4);
  currentY += row8Height;

  const row9Height = 7;
  pdf.rect(startX, currentY, labelWidth, row9Height);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('1', startX + 5, currentY + 5);
  pdf.text(shipment.weight.toString(), startX + colWidth + 2, currentY + 5);
  pdf.text('-', startX + colWidth * 2 + 2, currentY + 5);
  pdf.text(shipment.pieces.toString(), startX + colWidth * 3 + 5, currentY + 5);
  currentY += row9Height;

  // --- 8. Bottom Footer (Barcode & Contact) ---
  // Calculate remaining space and use it efficiently
  const remainingSpace = labelHeight + startY - currentY;
  drawBorder(currentY, remainingSpace);

  try {
    const canvas2 = document.createElement('canvas');
    JsBarcode(canvas2, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2,
      height: 30, // Reduced height significantly to avoid overlap
      displayValue: true,
      fontSize: 10, // Smaller font for barcode text
      margin: 0,
      textMargin: 0
    });
    const b2Url = canvas2.toDataURL('image/png');
    // Position barcode in upper part of footer
    // Image height roughly 12mm
    pdf.addImage(b2Url, 'PNG', startX + 15, currentY + 2, 66, 12);
  } catch (e) { /* ignore */ }

  pdf.setFontSize(6);
  // Place text at very bottom
  pdf.text('Support: support@pathxpress.net | +971 522803433', startX + labelWidth / 2, currentY + remainingSpace - 2, { align: 'center' });

  // Save
  pdf.save(`waybill-${shipment.waybillNumber}.pdf`);
}
