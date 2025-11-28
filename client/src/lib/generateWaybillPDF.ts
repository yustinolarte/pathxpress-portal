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
  weight: number;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  serviceType: string;
  status: string;
  createdAt: Date | string;
  pickupDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  codRequired?: number;
  codAmount?: string | null;
  codCurrency?: string | null;
}

export function generateWaybillPDF(shipment: ShipmentData) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Colors
  const primaryColor = '#1e40af'; // Blue
  const accentColor = '#dc2626'; // Red
  const textColor = '#1f2937';
  const lightGray = '#f3f4f6';

  // Header with logo area
  pdf.setFillColor(primaryColor);
  pdf.rect(0, 0, 210, 40, 'F');

  // Company name (since we can't embed PNG easily)
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('PATHXPRESS', 15, 20);
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Reliable Delivery Services in the UAE', 15, 28);

  // Waybill number (large, prominent)
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Waybill: ${shipment.waybillNumber}`, 15, 36);

  // Generate barcode
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, shipment.waybillNumber, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: false,
    });
    const barcodeDataUrl = canvas.toDataURL('image/png');
    pdf.addImage(barcodeDataUrl, 'PNG', 140, 10, 60, 25);
  } catch (error) {
    console.error('Failed to generate barcode:', error);
  }

  // Service type badge
  pdf.setFillColor(accentColor);
  pdf.roundedRect(140, 36, 60, 8, 2, 2, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  const serviceText = shipment.serviceType === 'express' ? 'EXPRESS' : 'STANDARD';
  pdf.text(serviceText, 170, 41, { align: 'center' });

  // Reset text color
  pdf.setTextColor(textColor);

  let yPos = 55;

  // Shipper Information
  pdf.setFillColor(lightGray);
  pdf.rect(10, yPos, 90, 8, 'F');
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SHIPPER INFORMATION', 15, yPos + 5.5);

  yPos += 12;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(shipment.shipperName, 15, yPos);
  
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(shipment.shipperAddress, 15, yPos);
  
  yPos += 5;
  pdf.text(`${shipment.shipperCity}, ${shipment.shipperCountry}`, 15, yPos);
  
  yPos += 5;
  pdf.text(`Phone: ${shipment.shipperPhone}`, 15, yPos);

  // Consignee Information
  yPos = 55;
  pdf.setFillColor(lightGray);
  pdf.rect(110, yPos, 90, 8, 'F');
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('CONSIGNEE INFORMATION', 115, yPos + 5.5);

  yPos += 12;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(shipment.customerName, 115, yPos);
  
  yPos += 5;
  pdf.setFont('helvetica', 'normal');
  pdf.text(shipment.address, 115, yPos);
  
  yPos += 5;
  const destination = shipment.emirate 
    ? `${shipment.city}, ${shipment.emirate}, ${shipment.destinationCountry}`
    : `${shipment.city}, ${shipment.destinationCountry}`;
  pdf.text(destination, 115, yPos);
  
  yPos += 5;
  pdf.text(`Phone: ${shipment.customerPhone}`, 115, yPos);

  // COD Warning (if applicable)
  if (shipment.codRequired && shipment.codAmount) {
    yPos = 100;
    pdf.setFillColor(255, 165, 0); // Orange background
    pdf.rect(10, yPos, 190, 15, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('⚠ CASH ON DELIVERY (COD)', 15, yPos + 6);
    pdf.setFontSize(12);
    pdf.text(`COLLECT: ${shipment.codAmount} ${shipment.codCurrency || 'AED'} FROM CUSTOMER`, 15, yPos + 12);
    pdf.setTextColor(textColor);
    yPos += 20;
  } else {
    yPos = 100;
  }

  // Shipment Details
  pdf.setFillColor(lightGray);
  pdf.rect(10, yPos, 190, 8, 'F');
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('SHIPMENT DETAILS', 15, yPos + 5.5);

  yPos += 15;
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');

  // Details in a grid
  const col1X = 15;
  const col2X = 75;
  const col3X = 135;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Pieces:', col1X, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(shipment.pieces.toString(), col1X + 20, yPos);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Weight:', col2X, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`${shipment.weight} kg`, col2X + 20, yPos);

  pdf.setFont('helvetica', 'bold');
  pdf.text('Status:', col3X, yPos);
  pdf.setFont('helvetica', 'normal');
  pdf.text(shipment.status.replace(/_/g, ' ').toUpperCase(), col3X + 20, yPos);

  if (shipment.length && shipment.width && shipment.height) {
    yPos += 7;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Dimensions:', col1X, yPos);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${shipment.length} x ${shipment.width} x ${shipment.height} cm`, col1X + 25, yPos);
  }

  yPos += 7;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Created:', col1X, yPos);
  pdf.setFont('helvetica', 'normal');
  const createdDate = new Date(shipment.createdAt).toLocaleDateString('en-GB');
  pdf.text(createdDate, col1X + 20, yPos);

  if (shipment.pickupDate) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Pickup:', col2X, yPos);
    pdf.setFont('helvetica', 'normal');
    const pickupDate = new Date(shipment.pickupDate).toLocaleDateString('en-GB');
    pdf.text(pickupDate, col2X + 20, yPos);
  }

  if (shipment.deliveryDate) {
    pdf.setFont('helvetica', 'bold');
    pdf.text('Delivery:', col3X, yPos);
    pdf.setFont('helvetica', 'normal');
    const deliveryDate = new Date(shipment.deliveryDate).toLocaleDateString('en-GB');
    pdf.text(deliveryDate, col3X + 20, yPos);
  }

  // Barcode at bottom for scanning
  yPos = 150;
  try {
    const canvas2 = document.createElement('canvas');
    JsBarcode(canvas2, shipment.waybillNumber, {
      format: 'CODE128',
      width: 3,
      height: 80,
      displayValue: true,
      fontSize: 14,
    });
    const barcodeDataUrl2 = canvas2.toDataURL('image/png');
    pdf.addImage(barcodeDataUrl2, 'PNG', 40, yPos, 130, 40);
  } catch (error) {
    console.error('Failed to generate bottom barcode:', error);
  }

  // Footer
  yPos = 270;
  pdf.setFontSize(8);
  pdf.setTextColor(128, 128, 128);
  pdf.text('PATHXPRESS FZCO | Dubai, UAE | +971-XX-XXX-XXXX | info@pathxpress.ae', 105, yPos, { align: 'center' });
  pdf.text('For customer support, visit www.pathxpress.ae or contact us via WhatsApp', 105, yPos + 4, { align: 'center' });

  // Save the PDF
  pdf.save(`waybill-${shipment.waybillNumber}.pdf`);
}
