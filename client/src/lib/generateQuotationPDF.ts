import { jsPDF } from 'jspdf';
import { WAYBILL_LOGO } from '@/const';

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
}

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

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function makeRef(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const rand = String(Math.floor(1000 + Math.random() * 9000));
    return `QT-${y}${m}${d}-${rand}`;
}

export async function generateQuotationPDF(params: QuotationParams): Promise<void> {
    const { originCountry, destinationCountry, realWeightKg, dimensions, options } = params;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    const now = new Date();
    const quoteRef = makeRef(now);
    const volKg = (dimensions.length * dimensions.width * dimensions.height) / 5000;

    // ── Header bar ───────────────────────────────────────────────────────────
    pdf.setFillColor(220, 38, 38); // red-600
    pdf.rect(0, 0, pageWidth, 22, 'F');

    // Logo
    try {
        const logoData = await loadImageAsBase64(WAYBILL_LOGO);
        pdf.addImage(logoData, 'PNG', margin, 3, 40, 16);
    } catch {
        // if logo fails, just show text
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PathXpress', margin, 14);
    }

    // "SHIPPING QUOTATION" right-aligned in header
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SHIPPING QUOTATION', pageWidth - margin, 10, { align: 'right' });
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Ref: ${quoteRef}`, pageWidth - margin, 16, { align: 'right' });

    let y = 32;

    // ── Date line ────────────────────────────────────────────────────────────
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date: ${formatDate(now)}`, margin, y);
    pdf.text(`Valid for 7 days from date of issue`, pageWidth - margin, y, { align: 'right' });

    y += 8;

    // ── Shipment summary box ─────────────────────────────────────────────────
    pdf.setDrawColor(220, 220, 220);
    pdf.setFillColor(248, 248, 248);
    pdf.roundedRect(margin, y, contentWidth, 34, 2, 2, 'FD');

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(40, 40, 40);
    pdf.text('Shipment Summary', margin + 4, y + 7);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(60, 60, 60);

    const col1x = margin + 4;
    const col2x = margin + contentWidth / 2;
    const rowH = 7;

    pdf.text(`Origin:`, col1x, y + 15);
    pdf.setFont('helvetica', 'bold');
    pdf.text(originCountry, col1x + 28, y + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Destination:`, col1x, y + 15 + rowH);
    pdf.setFont('helvetica', 'bold');
    pdf.text(destinationCountry, col1x + 28, y + 15 + rowH);

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Actual Weight:`, col2x, y + 15);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${realWeightKg.toFixed(2)} kg`, col2x + 32, y + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Dimensions:`, col2x, y + 15 + rowH);
    pdf.setFont('helvetica', 'bold');
    pdf.text(
        `${dimensions.length}×${dimensions.width}×${dimensions.height} cm  (Vol: ${volKg.toFixed(2)} kg)`,
        col2x + 32, y + 15 + rowH
    );

    y += 42;

    // ── Services table header ─────────────────────────────────────────────────
    pdf.setFillColor(30, 30, 30);
    pdf.rect(margin, y, contentWidth, 8, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8.5);
    pdf.setFont('helvetica', 'bold');

    const c1 = margin + 3;
    const c2 = margin + contentWidth * 0.45;
    const c3 = margin + contentWidth * 0.68;
    const c4 = margin + contentWidth - 3;

    pdf.text('Service', c1, y + 5.5);
    pdf.text('Billing Weight', c2, y + 5.5);
    pdf.text('Price', c3, y + 5.5);
    pdf.text('Recommended', c4, y + 5.5, { align: 'right' });

    y += 8;

    // ── Service rows ──────────────────────────────────────────────────────────
    options.forEach((opt, idx) => {
        const rowHeight = 10 + (opt.notes.length > 0 ? opt.notes.length * 4 : 0);

        // Alternating / recommended background
        if (opt.isRecommended) {
            pdf.setFillColor(254, 242, 242); // light red tint
        } else if (idx % 2 === 0) {
            pdf.setFillColor(255, 255, 255);
        } else {
            pdf.setFillColor(250, 250, 250);
        }
        pdf.rect(margin, y, contentWidth, rowHeight, 'F');

        // Border bottom
        pdf.setDrawColor(235, 235, 235);
        pdf.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

        // Service name
        pdf.setTextColor(30, 30, 30);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.text(opt.displayName, c1, y + 6.5);

        // Billing weight
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${opt.bracketUsed.value} ${opt.bracketUsed.unit}`, c2, y + 6.5);

        // Price
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(220, 38, 38);
        pdf.text(`${opt.total.toFixed(2)} ${opt.currency}`, c3, y + 6.5);
        pdf.setTextColor(30, 30, 30);

        // Recommended star
        if (opt.isRecommended) {
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(220, 38, 38);
            pdf.setFontSize(8);
            pdf.text('★ Recommended', c4, y + 6.5, { align: 'right' });
            pdf.setTextColor(30, 30, 30);
        }

        // Notes (italic, smaller)
        if (opt.notes.length > 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setFontSize(7);
            pdf.setTextColor(110, 110, 110);
            opt.notes.forEach((note, ni) => {
                pdf.text(`• ${note}`, c1 + 2, y + 11 + ni * 4);
            });
            pdf.setTextColor(30, 30, 30);
        }

        y += rowHeight;
    });

    y += 10;

    // ── Footer ────────────────────────────────────────────────────────────────
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, margin + contentWidth, y);
    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('PathXpress International Shipping  |  www.pathxpress.net  |  +971 522803433', pageWidth / 2, y, { align: 'center' });
    y += 5;
    pdf.text('This quotation is valid for 7 days. Prices are subject to change based on actual shipment dimensions and weight verification.', pageWidth / 2, y, { align: 'center' });

    // ── Save ──────────────────────────────────────────────────────────────────
    const safeDest = destinationCountry.replace(/\s+/g, '-');
    pdf.save(`quotation-${safeDest}-${Date.now()}.pdf`);
}
