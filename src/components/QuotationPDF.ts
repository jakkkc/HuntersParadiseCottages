import { jsPDF } from 'jspdf';
import { Quotation } from '../types';

/**
 * Generates and downloads a beautiful, professional PDF for a Quotation.
 */
export function generateQuotationPDF(quote: Quotation) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Theme colors
  const primaryColor = '#D85A30'; // Coral (Hunters Paradise primary)
  const secondaryColor = '#993C1D'; // Burnt brown-red
  const textColorDark = '#2C2C2A'; // Charcoal
  const textColorLight = '#5C5C5A'; // Muted grey
  const lightBg = '#FAECE7'; // Card tint

  // Format money KES
  const formatKES = (value: number) => {
    return 'KES ' + value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // 1. HEADER BRAND BAR
  doc.setFillColor(216, 90, 48); // #D85A30
  doc.rect(0, 0, 210, 38, 'F');

  // Title Branding Text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('HUNTERS PARADISE COTTAGES', 15, 16);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Luxury Cottages • Events & Conference Center • Gym & Swimming • Safaris', 15, 22);

  // 2. BRANCH DETAILS PANEL
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  
  // Right side of Header: Branch Info
  let branchTel = '';
  let branchEmail = '';
  let branchAddress = 'P.O. Box 1511 Bungoma, 50200';
  
  if (quote.branch === 'Tuuti') {
    doc.text('BRANCH: HUNTERS PARADISE TUUTI', 115, 14);
    branchTel = '0710 720 664 / 0735 994 400';
    branchEmail = 'tuuti@huntersparadise.ke';
  } else {
    doc.text('BRANCH: HUNTERS PARADISE MAIN', 115, 14);
    branchTel = '0739 601 802 / 0715 875 206';
    branchEmail = 'info@huntersparadise.ke';
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Address: ${branchAddress}`, 115, 19);
  doc.text(`Tel: ${branchTel}`, 115, 24);
  doc.text(`Email: ${branchEmail}`, 115, 29);

  // 3. DOCUMENT METADATA
  doc.setTextColor(textColorDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('OFFICIAL QUOTATION', 15, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  // Left col: Quote info
  doc.text(`Quote Number: ${quote.quoteNumber}`, 15, 56);
  doc.text(`Date Issued: ${new Date(quote.createdAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}`, 15, 61);
  doc.text(`Validity Period: ${quote.validityPeriod} Days`, 15, 66);

  // Right col: Prep details
  doc.text(`Sales Advisor: ${quote.createdByName}`, 115, 56);
  doc.text(`Sales Email: ${quote.clientEmail ? quote.clientEmail : 'internal@huntersparadise.ke'}`, 115, 61);
  doc.text(`Status: ${quote.status}`, 115, 66);

  // Divider Line
  doc.setDrawColor(220, 220, 220);
  doc.line(15, 71, 195, 71);

  // 4. CLIENT METADATA SECTION
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('QUOTATION PREPARED FOR:', 15, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Client Name: ${quote.clientName}`, 15, 86);
  if (quote.companyName) {
    doc.text(`Company / Organization: ${quote.companyName}`, 15, 91);
  }
  if (quote.clientPhone) {
    doc.text(`Phone: ${quote.clientPhone}`, 15, 96);
  }

  // Right Info relative to rates overrides if useful
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Schedule:', 115, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('Invoice Mode: Manual Booking Ref', 115, 86);
  doc.text('Currency: Kenyan Shillings (KES)', 115, 91);

  // Divider Line
  doc.line(15, 103, 195, 103);

  // 5. ITEMIZED ITEMS TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SCHEDULE OF SERVICES & EVENT TARIFFS', 15, 111);

  // Table Headers
  const tableY = 117;
  doc.setFillColor(250, 236, 231); // #FAECE7 light coral tint
  doc.rect(15, tableY, 180, 8, 'F');
  
  doc.setTextColor(secondaryColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Category / Service Description', 17, tableY + 5.5);
  doc.text('Rack Rate', 105, tableY + 5.5);
  doc.text('Neg. Unit Price', 128, tableY + 5.5);
  doc.text('Qty / Days', 158, tableY + 5.5);
  doc.text('Subtotal', 180, tableY + 5.5);

  // Reset colors
  doc.setTextColor(textColorDark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  let currentY = tableY + 8;
  quote.items.forEach((item, idx) => {
    // Zebra background tint
    if (idx % 2 === 1) {
      doc.setFillColor(252, 248, 246);
      doc.rect(15, currentY, 180, 8, 'F');
    }

    // Fill row cells
    const shortenedDesc = item.description.length > 52 
      ? item.description.substring(0, 49) + '...'
      : item.description;

    doc.text(`${item.category} - ${shortenedDesc}`, 17, currentY + 5.5);
    doc.text(formatKES(item.originalRate), 105, currentY + 5.5);
    doc.setTextColor(secondaryColor);
    doc.setFont('helvetica', 'bold');
    doc.text(formatKES(item.negotiatedRate), 128, currentY + 5.5);
    doc.setTextColor(textColorDark);
    doc.setFont('helvetica', 'normal');
    
    const qtyText = item.days ? `${item.quantity} pax x ${item.days}d` : `${item.quantity}`;
    doc.text(qtyText, 158, currentY + 5.5);
    doc.text(formatKES(item.subtotal), 180, currentY + 5.5);

    // Draw line border
    doc.setDrawColor(240, 240, 240);
    doc.line(15, currentY + 8, 195, currentY + 8);
    currentY += 8;
  });

  // 6. TOTALS WORKPANEL
  currentY += 4;
  doc.setFillColor(250, 250, 250);
  doc.rect(115, currentY, 80, 24, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.rect(115, currentY, 80, 24, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Subtotal:', 118, currentY + 6);
  doc.text(formatKES(quote.subtotal), 160, currentY + 6);

  doc.text('Discount:', 118, currentY + 12);
  doc.text(formatKES(quote.discount), 160, currentY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(secondaryColor);
  doc.text('Grand Total:', 118, currentY + 19);
  doc.text(formatKES(quote.total), 160, currentY + 19);

  // 7. TERMS & STICKY CONDITIONS
  doc.setTextColor(textColorDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Terms & Conditions:', 15, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textColorLight);
  
  const formattedTerms = quote.terms || '1. Standard check in: 12:00 PM, Check out: 10:00 AM.\n2. Invoices are inclusive of all statutory V.A.T. and Tourism Levies.\n3. Deposit of 50% is required to secure any conference bookings.\n4. Negotiated rates are tailored for the specified company only and are confidential.';
  const splitTerms = doc.splitTextToSize(formattedTerms, 90);
  doc.text(splitTerms, 15, currentY + 11);

  // 8. SIGNATURE SIGN OFF PANEL
  currentY += 34;
  doc.line(15, currentY, 80, currentY);
  doc.line(120, currentY, 185, currentY);

  doc.setTextColor(textColorDark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Prepared By: Sales Executive', 15, currentY + 4);
  doc.setFont('helvetica', 'bold');
  doc.text(quote.createdByName, 15, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Client Signee / Date', 120, currentY + 4);
  doc.text('Stamp & Acceptance Signature', 120, currentY + 8);

  // FOOTER BANNER
  doc.setFillColor(250, 236, 231);
  doc.rect(0, 285, 210, 12, 'F');
  doc.setTextColor(textColorLight);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text('Hunters Paradise Cottages (Bungoma): Elegance, comfort, and absolute peace of mind in western Kenya.', 15, 290);
  doc.text('Printed via HPC CRM System.', 165, 290);

  // Download Action
  const filename = `Quotation_${quote.quoteNumber.replace(/\//g, '_')}.pdf`;
  doc.save(filename);
}
