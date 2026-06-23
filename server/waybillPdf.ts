/**
 * Server-side waybill PDF renderer.
 *
 * Node port of client/src/lib/generateWaybillPDF.ts so the Shopify integration
 * (and any server caller) can produce the exact same 100×150mm shipping label
 * without a browser. The only browser-specific pieces of the original are:
 *   - the logo image load  → replaced with a filesystem read + @napi-rs/canvas
 *   - the CODE128 barcode  → rendered on a @napi-rs/canvas instead of a DOM canvas
 * QRCode.toDataURL and jsPDF already run headless in Node.
 *
 * Keep this layout in sync with the client generator.
 */
import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';

export interface WaybillShipment {
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
  serviceType: string;
  status: string;
  createdAt: Date | string;
  codRequired?: number;
  codAmount?: string | null;
  codCurrency?: string | null;
  specialInstructions?: string | null;
  hideShipperAddress?: number;
  hideConsigneeAddress?: number;
  isReturn?: number;
  fitOnDelivery?: number;
  itemsDescription?: string | null;
  preferredDeliveryDate?: string | null;
  preferredDeliveryTime?: string | null;
}

// Short label shown on the waybill box for each service code.
function getServiceLabel(serviceType: string): string {
  switch (serviceType) {
    case 'SDD': return 'SDD';
    case 'BULLET': return 'BULLET';
    case 'EXPRESS_ZONE2': return 'EXP2';
    case 'PREFERRED_TIME': return 'PREF';
    case 'PREFERRED_TIME_SDD': return 'PREF-SD';
    case 'DOM': return 'DOM';
    default: return serviceType ? serviceType.substring(0, 6).toUpperCase() : 'DOM';
  }
}

// City code mapping for UAE cities.
function getCityCode(city: string): string {
  const cityLower = (city || '').toLowerCase().trim();
  if (cityLower.includes('dubai') || cityLower === 'dxb') return 'DXB';
  if (cityLower.includes('sharjah') || cityLower === 'shj') return 'SHJ';
  if (cityLower.includes('abu dhabi') || cityLower.includes('abudhabi')) return 'AUH';
  if (cityLower.includes('ajman')) return 'AJM';
  if (cityLower.includes('fujairah') || cityLower.includes('fujeirah')) return 'FUJ';
  if (cityLower.includes('ras al') || cityLower.includes('rak')) return 'RAK';
  if (cityLower.includes('umm al') || cityLower.includes('uaq')) return 'UAQ';
  if (cityLower.includes('al ain')) return 'AAN';
  return (city || 'N/A').substring(0, 3).toUpperCase();
}

// Encode package data for route scanning (base64 JSON).
function encodePackageData(shipment: WaybillShipment): string {
  const data = {
    w: shipment.waybillNumber,
    n: shipment.customerName,
    p: shipment.customerPhone,
    a: (shipment.address || '').substring(0, 50),
    c: shipment.city,
    kg: shipment.weight,
    s: shipment.serviceType,
    cod: shipment.codRequired === 1 ? shipment.codAmount : '0',
    pcs: shipment.pieces,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

// Cache the logo (data URL + natural dimensions) across requests.
let cachedLogo: { data: string; w: number; h: number } | null | undefined;

async function getWaybillLogo(): Promise<{ data: string; w: number; h: number } | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  const candidates = [
    path.join(process.cwd(), 'dist', 'public', 'pathxpress-waybill-logo.png'),
    path.join(process.cwd(), 'client', 'public', 'pathxpress-waybill-logo.png'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      const img = await loadImage(buf);
      cachedLogo = {
        data: `data:image/png;base64,${buf.toString('base64')}`,
        w: img.width,
        h: img.height,
      };
      return cachedLogo;
    } catch {
      // try next candidate
    }
  }
  cachedLogo = null;
  return null;
}

/**
 * Render the shipping label and return it as a PDF Buffer.
 */
export async function renderWaybillPdf(shipment: WaybillShipment): Promise<Buffer> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [100, 150] });

  const pageWidth = 100;
  const pageHeight = 150;
  const margin = 3;
  const contentWidth = pageWidth - margin * 2;

  const black = '#000000';
  const white = '#FFFFFF';

  // Black border
  pdf.setDrawColor(black);
  pdf.setLineWidth(1);
  pdf.rect(1, 1, pageWidth - 2, pageHeight - 2);

  let y = margin + 2;

  // ===== HEADER: Logo =====
  const logo = await getWaybillLogo();
  if (logo) {
    const maxW = 48, maxH = 12;
    const ratio = Math.min(maxW / logo.w, maxH / logo.h);
    const logoW = logo.w * ratio;
    const logoH = logo.h * ratio;
    pdf.addImage(logo.data, 'PNG', margin, y + (maxH - logoH) / 2, logoW, logoH);
  } else {
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

  // Return shipment banner
  if (shipment.isReturn === 1) {
    pdf.setFillColor(0, 150, 150);
    pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('<<< RETURN SHIPMENT >>>', pageWidth / 2, y + 4, { align: 'center' });
    pdf.setTextColor(black);
    y += 8;
  }

  // Fit on Delivery banner
  if (shipment.fitOnDelivery === 1) {
    pdf.setFillColor(128, 0, 128);
    pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text('FOD - WAIT FOR CUSTOMER', pageWidth / 2, y + 4, { align: 'center' });
    pdf.setTextColor(black);
    y += 8;
  }

  // Preferred delivery time banner (scheduled deliveries)
  if (shipment.preferredDeliveryDate || shipment.preferredDeliveryTime) {
    const parts = [shipment.preferredDeliveryDate, shipment.preferredDeliveryTime].filter(Boolean).join('  ');
    pdf.setFillColor(0, 0, 0);
    pdf.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`DELIVER AT: ${parts}`, pageWidth / 2, y + 4, { align: 'center' });
    pdf.setTextColor(black);
    y += 8;
  }

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

  if (shipment.hideShipperAddress === 1) {
    pdf.text(`${shipment.shipperCity}`, margin + 11, y + 7);
    y += 10;
  } else {
    if (shipment.shipperAddress) {
      const addrLines = pdf.splitTextToSize(shipment.shipperAddress, contentWidth - 11);
      pdf.text(addrLines[0], margin + 11, y + 7);
      pdf.text(`${shipment.shipperPhone} | ${shipment.shipperCity}`, margin + 11, y + 11);
      y += 14;
    } else {
      pdf.text(`${shipment.shipperPhone} | ${shipment.shipperCity}`, margin + 11, y + 7);
      y += 10;
    }
  }
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== CONSIGNEE (TO) Section =====
  y += 2;

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TO:', margin, y + 4);

  pdf.setFontSize(11);
  pdf.text(shipment.customerName, margin + 7, y + 5);

  let addressHeight = 0;
  if (shipment.hideConsigneeAddress === 1) {
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${shipment.city}, ${shipment.destinationCountry}`, margin + 7, y + 10);
    addressHeight = 0;
  } else {
    pdf.setFontSize(9);
    pdf.text(shipment.customerPhone, margin + 7, y + 10);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    const addressMaxWidth = contentWidth - 48;
    const addressLines = pdf.splitTextToSize(shipment.address, addressMaxWidth);
    const displayedLines = addressLines.slice(0, 4);
    pdf.text(displayedLines, margin + 7, y + 14);

    addressHeight = displayedLines.length * 3;

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${shipment.city}, ${shipment.destinationCountry}`, margin + 7, y + 14 + addressHeight + 1);
  }

  // ROUTING CODE + QR (right side)
  const routingX = pageWidth - margin - 40;
  const cityCode = getCityCode(shipment.city);

  pdf.setFillColor(black);
  pdf.rect(routingX, y, 18, 22, 'F');

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(white);
  pdf.text(cityCode, routingX + 9, y + 14, { align: 'center' });

  pdf.setFontSize(8);
  const serviceType = getServiceLabel(shipment.serviceType);
  pdf.text(serviceType, routingX + 9, y + 20, { align: 'center' });
  pdf.setTextColor(black);

  const qrSize = 20;
  const qrX = routingX + 20;

  try {
    const packageData = encodePackageData(shipment);
    const qrDataUrl = await QRCode.toDataURL(packageData, {
      width: 200,
      margin: 0,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    pdf.addImage(qrDataUrl, 'PNG', qrX, y + 1, qrSize, qrSize);
  } catch (e) {
    pdf.setDrawColor(black);
    pdf.rect(qrX, y + 1, qrSize, qrSize);
    pdf.setFontSize(5);
    pdf.text('SCAN', qrX + qrSize / 2, y + qrSize / 2, { align: 'center' });
  }

  y += 30;
  pdf.setDrawColor(black);
  pdf.line(margin, y, pageWidth - margin, y);

  // ===== PACKAGE INFO + COD =====
  y += 2;

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
  pdf.text(String(shipment.pieces), margin + colWidth / 2, y + 11, { align: 'center' });

  // Weight
  pdf.rect(margin + colWidth, y, colWidth, 14);
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('KG', margin + colWidth + colWidth / 2, y + 4, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  const weightVal = typeof shipment.weight === 'string' ? parseFloat(shipment.weight) : shipment.weight;
  pdf.text((weightVal || 0).toFixed(1), margin + colWidth + colWidth / 2, y + 11, { align: 'center' });

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
    const instrMaxWidth = contentWidth - 15;
    const instrLines = pdf.splitTextToSize(shipment.specialInstructions, instrMaxWidth);
    const numLines = Math.min(instrLines.length, 2);
    const boxHeight = 6 + numLines * 4;

    pdf.setDrawColor(black);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, contentWidth, boxHeight);

    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text('NOTE:', margin + 2, y + 4);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(instrLines.slice(0, 2), margin + 12, y + 4);

    y += boxHeight + 2;
  }

  // ===== ITEMS DESCRIPTION =====
  if (shipment.itemsDescription && shipment.itemsDescription.trim()) {
    const itemsMaxWidth = contentWidth - 15;
    const itemsLines = pdf.splitTextToSize(shipment.itemsDescription, itemsMaxWidth);
    const numItemLines = Math.min(itemsLines.length, 3);
    const itemsBoxHeight = 6 + numItemLines * 3.5;

    pdf.setDrawColor(black);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, y, contentWidth, itemsBoxHeight);

    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.text('ITEMS:', margin + 2, y + 4);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(itemsLines.slice(0, 3), margin + 12, y + 4);

    y += itemsBoxHeight + 2;
  }

  // ===== MAIN BARCODE (Large, High Quality) =====
  y = pageHeight - 35;

  pdf.setDrawColor(black);
  pdf.setLineWidth(0.3);
  pdf.line(margin, y - 2, pageWidth - margin, y - 2);

  try {
    const canvas = createCanvas(600, 120);
    JsBarcode(canvas as any, shipment.waybillNumber, {
      format: 'CODE128',
      width: 3,
      height: 60,
      displayValue: false,
      margin: 0,
      background: '#FFFFFF',
      lineColor: '#000000',
    });
    const barcodeUrl = canvas.toDataURL('image/png');
    pdf.addImage(barcodeUrl, 'PNG', margin + 5, y, contentWidth - 10, 18);
  } catch (e) {
    console.error('Barcode error:', e);
  }

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(black);
  pdf.text(shipment.waybillNumber, pageWidth / 2, y + 24, { align: 'center' });

  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.text('pathxpress.net  |  +971 522803433', pageWidth / 2, pageHeight - 4, { align: 'center' });

  return Buffer.from(pdf.output('arraybuffer'));
}
