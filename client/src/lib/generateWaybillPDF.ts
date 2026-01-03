
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
  hideShipperAddress?: number; // 0 = show, 1 = hide shipper address on waybill
}

// City code mapping for UAE cities
function getCityCode(city: string): string {
  const cityLower = city.toLowerCase().trim();

  // UAE Cities
  if (cityLower.includes('dubai') || cityLower === 'dxb') return 'DXB';
  if (cityLower.includes('sharjah') || cityLower === 'shj') return 'SHJ';
  if (cityLower.includes('abu dhabi') || cityLower.includes('abudhabi')) return 'AUH';
  if (cityLower.includes('ajman')) return 'AJM';
  if (cityLower.includes('fujairah') || cityLower.includes('fujeirah')) return 'FUJ';
  if (cityLower.includes('ras al') || cityLower.includes('rak')) return 'RAK';
  if (cityLower.includes('umm al') || cityLower.includes('uaq')) return 'UAQ';
  if (cityLower.includes('al ain')) return 'AAN';

  // Default: first 3 letters uppercase
  return city.substring(0, 3).toUpperCase();
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

// Encode package data for route scanning
function encodePackageData(shipment: ShipmentData): string {
  const data = {
    w: shipment.waybillNumber,           // waybill
    n: shipment.customerName,             // name
    p: shipment.customerPhone,            // phone
    a: shipment.address.substring(0, 50), // address (truncated)
    c: shipment.city,                     // city
    kg: shipment.weight,                  // weight
    s: shipment.serviceType,              // service
    cod: shipment.codRequired === 1 ? shipment.codAmount : '0',
    pcs: shipment.pieces
  };

  // Encode as base64 for compactness
  return btoa(JSON.stringify(data));
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
  const margin = 3;
  const contentWidth = pageWidth - (margin * 2);

  // Black and white colors only
  const black = '#000000';
  const white = '#FFFFFF';

  // Black border
  pdf.setDrawColor(black);
  pdf.setLineWidth(1);
  pdf.rect(1, 1, pageWidth - 2, pageHeight - 2);

  let y = margin + 2;

  // ===== HEADER: Logo =====

  // Try to load the logo with correct proportions
  try {
    const logoBase64 = await loadImageAsBase64('/pathxpress-logo.png');
    pdf.addImage(logoBase64, 'PNG', margin, y, 48, 12);
  } catch (e) {
    // Fallback: Text logo in black
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(black);
    pdf.text('PATHXPRESS', margin, y + 8);
  }

  // Date on right
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(black);
  const dateStr = new Date(shipment.createdAt).toLocaleDateString('en-GB');
  pdf.text(dateStr, pageWidth - margin, y + 4, { align: 'right' });
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(shipment.waybillNumber, pageWidth - margin, y + 9, { align: 'right' });

  y += 16;

  // Separator line
  pdf.setDrawColor(black);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== SHIPPER (FROM) Section =====
  y += 2;

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text('FROM:', margin, y + 3);

  pdf.setFontSize(8);
  pdf.text(shipment.shipperName, margin + 11, y + 3);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');

  // Check if shipper address should be hidden
  if (shipment.hideShipperAddress === 1) {
    // Only show city (no phone or full address for privacy)
    pdf.text(`${shipment.shipperCity}`, margin + 11, y + 7);
  } else {
    // Show full contact info
    pdf.text(`${shipment.shipperPhone} | ${shipment.shipperCity}`, margin + 11, y + 7);
  }

  y += 10;
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== CONSIGNEE (TO) Section =====
  y += 2;

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TO:', margin, y + 4);

  // Customer name (large and bold)
  pdf.setFontSize(13);
  pdf.text(shipment.customerName, margin + 7, y + 5);

  // Phone
  pdf.setFontSize(11);
  pdf.text(shipment.customerPhone, margin + 7, y + 11);

  // Address
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const addressLines = pdf.splitTextToSize(shipment.address, contentWidth - 35);
  pdf.text(addressLines.slice(0, 2), margin + 7, y + 16);

  // City (bold)
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${shipment.city}, ${shipment.destinationCountry}`, margin + 7, y + 24);

  // ROUTING CODE + QR (right side)
  const routingX = pageWidth - margin - 40;
  const cityCode = getCityCode(shipment.city);

  // City code box (black background)
  pdf.setFillColor(black);
  pdf.rect(routingX, y, 18, 22, 'F');

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(white);
  pdf.text(cityCode, routingX + 9, y + 14, { align: 'center' });

  // Service type below city code
  pdf.setFontSize(8);
  const serviceType = shipment.serviceType === 'SDD' ? 'SDD' : 'DOM';
  pdf.text(serviceType, routingX + 9, y + 20, { align: 'center' });
  pdf.setTextColor(black);

  // QR Code with encoded package data (for route scanning)
  const qrSize = 20;
  const qrX = routingX + 20;

  try {
    const packageData = encodePackageData(shipment);
    const qrDataUrl = await QRCode.toDataURL(packageData, {
      width: 200,
      margin: 0,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    pdf.addImage(qrDataUrl, 'PNG', qrX, y + 1, qrSize, qrSize);
  } catch (e) {
    pdf.setDrawColor(black);
    pdf.rect(qrX, y + 1, qrSize, qrSize);
    pdf.setFontSize(5);
    pdf.text('SCAN', qrX + qrSize / 2, y + qrSize / 2, { align: 'center' });
  }

  y += 28;
  pdf.setDrawColor(black);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== PACKAGE INFO + COD =====
  y += 2;

  // Info grid - 4 columns
  const colWidth = contentWidth / 4;

  // Pieces
  pdf.setDrawColor(black);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, y, colWidth, 14);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('PCS', margin + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(shipment.pieces.toString(), margin + colWidth / 2, y + 11, { align: 'center' });

  // Weight
  pdf.rect(margin + colWidth, y, colWidth, 14);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('KG', margin + colWidth + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  const weightVal = typeof shipment.weight === 'string' ? parseFloat(shipment.weight) : shipment.weight;
  pdf.text(weightVal.toFixed(1), margin + colWidth + colWidth / 2, y + 11, { align: 'center' });

  // Service Type
  pdf.rect(margin + colWidth * 2, y, colWidth, 14);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('SERVICE', margin + colWidth * 2 + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(serviceType, margin + colWidth * 2 + colWidth / 2, y + 11, { align: 'center' });

  // COD or Prepaid
  pdf.rect(margin + colWidth * 3, y, colWidth, 14);

  if (shipment.codRequired === 1 && shipment.codAmount) {
    // COD - black background
    pdf.setFillColor(black);
    pdf.rect(margin + colWidth * 3, y, colWidth, 14, 'F');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(white);
    pdf.text('COD', margin + colWidth * 3 + colWidth / 2, y + 4, { align: 'center' });
    pdf.setFontSize(9);
    const codAmount = parseFloat(shipment.codAmount).toFixed(0);
    pdf.text(`${codAmount}`, margin + colWidth * 3 + colWidth / 2, y + 11, { align: 'center' });
    pdf.setTextColor(black);
  } else {
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.text('STATUS', margin + colWidth * 3 + colWidth / 2, y + 4, { align: 'center' });
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PREPAID', margin + colWidth * 3 + colWidth / 2, y + 11, { align: 'center' });
  }

  y += 16;

  // ===== SPECIAL INSTRUCTIONS =====
  if (shipment.specialInstructions && shipment.specialInstructions.trim()) {
    pdf.setDrawColor(black);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, contentWidth, 10);

    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text('NOTE:', margin + 2, y + 4);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    const instrLines = pdf.splitTextToSize(shipment.specialInstructions, contentWidth - 15);
    pdf.text(instrLines.slice(0, 1).join(' '), margin + 12, y + 4);

    y += 12;
  }

  // ===== MAIN BARCODE (Large, High Quality) =====
  y = pageHeight - 35;

  pdf.setDrawColor(black);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y - 2, pageWidth - margin, y - 2);

  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, shipment.waybillNumber, {
      format: 'CODE128',
      width: 3,
      height: 60,
      displayValue: false,
      margin: 0,
      background: '#FFFFFF',
      lineColor: '#000000'
    });
    const barcodeUrl = canvas.toDataURL('image/png');
    pdf.addImage(barcodeUrl, 'PNG', margin + 5, y, contentWidth - 10, 18);
  } catch (e) {
    console.error('Barcode error:', e);
  }

  // Waybill number text (separate for clarity)
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(shipment.waybillNumber, pageWidth / 2, y + 24, { align: 'center' });

  // Footer
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('pathxpress.net  |  +971 522803433', pageWidth / 2, pageHeight - 4, { align: 'center' });

  // Save
  pdf.save(`waybill-${shipment.waybillNumber}.pdf`);
}
