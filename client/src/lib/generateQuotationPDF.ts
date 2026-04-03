import { jsPDF } from 'jspdf';
// Side-effect imports — register Poppins with jsPDF's font system
import './fonts/Poppins-Regular-normal.js';
import './fonts/Poppins-Bold-normal.js';

interface QuoteOption {
    serviceKey: string;
    displayName: string;
    currency: string;
    total: number;
    bracketUsed: { value: number; unit: string };
    notes: string[];
    isRecommended?: boolean;
}

interface QuotationParams {
    originCountry: string;
    destinationCountry: string;
    realWeightKg: number;
    dimensions: { length: number; width: number; height: number };
    options: QuoteOption[];
    clientName?: string;
    clientPhone?: string;
    quantity?: number;
    validityDays?: number;
    insuranceAED?: number;
    quotationNo?: string;
}

async function loadImageWithSize(url: string): Promise<{ data: string; w: number; h: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve({ data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
            } else {
                reject(new Error('canvas context failed'));
            }
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = url;
    });
}

function formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${date.getFullYear()}`;
}

function makeQuotationNo(date: Date): string {
    const rand = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
    return `C${date.getFullYear()}-${rand}`;
}

export async function generateQuotationPDF(params: QuotationParams): Promise<void> {
    const {
        originCountry,
        destinationCountry,
        realWeightKg,
        dimensions,
        options,
        clientName,
        clientPhone,
        quantity = 1,
        validityDays = 3,
        insuranceAED = 25,
        quotationNo,
    } = params;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const margin = 14;
    const contentW = pageW - margin * 2;
    const now = new Date();
    const quoteRef = quotationNo ?? makeQuotationNo(now);
    const dateStr = formatDate(now);
    const navyR = 15, navyG = 23, navyB = 42;

    const fontNormal = 'Poppins-Regular';
    const fontBold   = 'Poppins-Bold';

    // ── Dark navy header bar ──────────────────────────────────────────────────
    pdf.setFillColor(navyR, navyG, navyB);
    pdf.rect(0, 0, pageW, 22, 'F');

    // Logo — maintain aspect ratio, fit within 50×16 mm box
    try {
        const logo = await loadImageWithSize('/pathxpress-logo.png');
        const maxW = 50, maxH = 16;
        const ratio = Math.min(maxW / logo.w, maxH / logo.h);
        const logoW = logo.w * ratio;
        const logoH = logo.h * ratio;
        const logoY = (22 - logoH) / 2;
        pdf.addImage(logo.data, 'PNG', margin, logoY, logoW, logoH);
    } catch {
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.setFont(fontBold, 'normal');
        pdf.text('PATHXPRESS', margin, 14);
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    let y = 32;

    // "QUOTATION" title
    pdf.setFont(fontBold, 'normal');
    pdf.setFontSize(22);
    pdf.setTextColor(220, 38, 38);
    pdf.text('QUOTATION', margin, y);

    // Quotation No
    y += 7;
    pdf.setFontSize(9);
    pdf.setTextColor(220, 38, 38);
    pdf.text(`Quotation No:${quoteRef}`, margin, y);

    // Date & Validity right-aligned
    const dateY = 34;
    pdf.setFont(fontNormal, 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(60, 60, 60);
    pdf.text('Date:', pageW - margin - 38, dateY);
    pdf.text(dateStr, pageW - margin, dateY, { align: 'right' });
    pdf.text('Validity (days) :', pageW - margin - 38, dateY + 6);
    pdf.text(String(validityDays), pageW - margin, dateY + 6, { align: 'right' });

    y += 10;

    // ── Client details ────────────────────────────────────────────────────────
    pdf.setFont(fontNormal, 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text('Client details:', margin, y);
    y += 5;

    if (clientPhone) {
        pdf.setFont(fontNormal, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(60, 60, 60);
        pdf.text(clientPhone, margin, y);
        y += 5;
    }

    if (clientName) {
        pdf.setFont(fontBold, 'normal');
        pdf.setFontSize(13);
        pdf.setTextColor(220, 38, 38);
        pdf.text(clientName.toUpperCase(), margin, y);
        y += 8;
    } else {
        y += 3;
    }

    // ── Intro paragraph ───────────────────────────────────────────────────────
    y += 2;
    pdf.setFont(fontNormal, 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(40, 40, 40);
    const atW = pdf.getTextWidth('At ');
    pdf.text('At ', margin, y);
    pdf.setFont(fontBold, 'normal');
    const pxW = pdf.getTextWidth('PATHXPRESS');
    pdf.text('PATHXPRESS', margin + atW, y);
    pdf.setFont(fontNormal, 'normal');
    pdf.text(', we are pleased to share the costs associated with your request:', margin + atW + pxW, y);

    y += 10;

    // ── Shipment details box ──────────────────────────────────────────────────
    const boxH = 42;
    pdf.setDrawColor(210, 210, 210);
    pdf.setFillColor(245, 245, 245);
    pdf.roundedRect(margin, y, contentW, boxH, 3, 3, 'FD');

    const labelX = margin + 5;
    const valueX = margin + 57;

    const rows: [string, string][] = [
        ['Country of Origin:', originCountry],
        ['Destination Country:', destinationCountry],
        ['Quantity:', `${quantity} package${quantity !== 1 ? 's' : ''}`],
        ['Weight (kg):', `${realWeightKg} kg`],
        ['Dimensions (L x W x H ):', `${dimensions.length}*${dimensions.width}*${dimensions.height} cm`],
    ];

    rows.forEach(([label, value], i) => {
        const rowY = y + 7 + i * 7;
        pdf.setFont(fontBold, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(40, 40, 40);
        pdf.text(label, labelX, rowY);
        pdf.setFont(fontNormal, 'normal');
        pdf.setTextColor(60, 60, 60);
        pdf.text(value, valueX, rowY);
    });

    y += boxH + 8;

    // ── Services table ────────────────────────────────────────────────────────
    const colCount = options.length + 1;
    const colW = contentW / colCount;
    const tableRowH = 12;
    const lineH = 4.5;

    pdf.setFont(fontBold, 'normal');
    pdf.setFontSize(8);
    const headerLabels = ['SERVICE', ...options.map(o => o.displayName.toUpperCase())];
    const wrappedHeaders = headerLabels.map(label =>
        pdf.splitTextToSize(label, colW - 4) as string[]
    );
    const maxHeaderLines = Math.max(...wrappedHeaders.map(l => l.length));
    const tableHeaderH = Math.max(12, maxHeaderLines * lineH + 5);
    const totalTableH = tableHeaderH + tableRowH;

    // Outer rounded border
    pdf.setDrawColor(185, 28, 28);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(margin, y, contentW, totalTableH, 3, 3, 'D');
    pdf.setLineWidth(0.2);

    // Header fill (rounded top, square bottom)
    pdf.setFillColor(185, 28, 28);
    pdf.roundedRect(margin, y, contentW, tableHeaderH, 3, 3, 'F');
    pdf.rect(margin, y + tableHeaderH - 3, contentW, 3, 'F');

    // Header text
    wrappedHeaders.forEach((lines, i) => {
        const cellCenterX = margin + i * colW + colW / 2;
        const totalTextH = lines.length * lineH;
        const startY = y + (tableHeaderH - totalTextH) / 2 + lineH;
        pdf.setFont(fontBold, 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(255, 255, 255);
        lines.forEach((line, li) => {
            pdf.text(line, cellCenterX, startY + li * lineH, { align: 'center' });
        });
    });

    y += tableHeaderH;

    // TOTAL row
    pdf.setFillColor(255, 255, 255);
    pdf.rect(margin, y, contentW, tableRowH, 'F');

    pdf.setFont(fontBold, 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(40, 40, 40);
    pdf.text('TOTAL', margin + colW / 2, y + tableRowH / 2 + 1.5, { align: 'center' });

    options.forEach((opt, i) => {
        const cellCenterX = margin + (i + 1) * colW + colW / 2;
        pdf.setFont(fontBold, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(40, 40, 40);
        pdf.text(`${Math.round(opt.total)} ${opt.currency}`, cellCenterX, y + tableRowH / 2 + 1.5, { align: 'center' });
    });

    // Vertical dividers
    pdf.setDrawColor(210, 210, 210);
    for (let i = 1; i < colCount; i++) {
        const divX = margin + i * colW;
        pdf.line(divX, y - tableHeaderH, divX, y + tableRowH);
    }

    y += tableRowH + 8;

    // ── Insurance note ────────────────────────────────────────────────────────
    pdf.setFont(fontBold, 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(40, 40, 40);
    pdf.text(`OPTIONAL: Insurance coverage based on declared value: ${insuranceAED} AED`, margin, y);

    y += 8;

    // ── Notes ─────────────────────────────────────────────────────────────────
    const allNotes = new Set<string>();
    options.forEach(o => o.notes.forEach(n => allNotes.add(n)));

    if (allNotes.size > 0) {
        pdf.setFont(fontBold, 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(40, 40, 40);
        pdf.text('• NOTES:', margin, y);
        y += 5;

        pdf.setFont(fontNormal, 'normal');
        pdf.setFontSize(8.5);
        allNotes.forEach(note => {
            const wrapped = pdf.splitTextToSize(`• ${note}`, contentW - 4) as string[];
            wrapped.forEach(line => {
                pdf.text(line, margin, y);
                y += 5;
            });
        });
    }

    // ── Footer bar ────────────────────────────────────────────────────────────
    pdf.setFillColor(navyR, navyG, navyB);
    pdf.rect(0, pageH - 14, pageW, 14, 'F');

    // ── Save ──────────────────────────────────────────────────────────────────
    try {
        const safeDest = destinationCountry.replace(/\s+/g, '-');
        pdf.save(`quotation-${quoteRef}-${safeDest}.pdf`);
    } catch (e) {
        console.error('[QuotationPDF] pdf.save failed:', e);
    }
}
