function normalizePdfText(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Remove zero-width / invisible characters
  text = text.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '');
  // Convert HTML breaks into real line breaks
  text = text.replace(/<br\s*\/?/gi, '\n');
  // Normalize line breaks and tabs
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/\t+/g, ' ');
  // Replace Unicode symbols with plain ASCII equivalents
  text = text.replace(/\u00D7/g, 'x');
  text = text.replace(/[\u2192\u21D2\u27A1\u2794]/g, '->');
  text = text.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-');
  text = text.replace(/[\u2018\u2019\u02BC\u0060]/g, "'");
  text = text.replace(/[\u201C\u201D]/g, '"');
  text = text.replace(/[\u2013\u2014\u2015]/g, '-');
  // Fix numbers with spaces after commas: "130, 001" -> "130,001"
  text = text.replace(/(\d),\s+(\d)/g, '$1,$2');
  // Fix dates with spaces: "10/ 05/ 2026" -> "10/05/2026"
  text = text.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2');
  // Normalize spaces, but preserve line breaks
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  return text.trim();
}

function parseMoney(value) {
  const num = parseFloat(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(value) {
  const num = parseMoney(value);
  return num.toLocaleString('en-PK');
}

function ensurePageSpace(doc, y, needed, drawHeader) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 30) return y;
  doc.addPage();
  drawHeader();
  return 34;
}

function renderAccountsSummaryPdf(options) {
  const {
    rows = [],
    supplierMap = {},
    quotation = {},
    client = {},
    agent = {},
    reportTitle = 'Accounts Cost Summary',
    packageLabel = '',
    currencyLabel = 'PKR',
    roe = null
  } = options || {};

  if (!window.jspdf || !window.jspdf.jsPDF) {
    if (typeof showNotification === 'function') {
      showNotification('PDF library not available.', 'error');
    }
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const M = 28; // margin
  const W = pageWidth - M * 2; // usable width
  let y = 34;

  // ── Header band ──────────────────────────────────────────────────────────────
  const drawHeader = () => {
    doc.setFillColor(11, 118, 209);
    doc.rect(M, y, W, 54, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Flight Connection Travel & Tours', M + 10, y + 22);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(reportTitle, M + 10, y + 40);
    doc.setTextColor(20, 20, 20);
    y += 64;
  };

  drawHeader();

  // ── Info block ───────────────────────────────────────────────────────────────
  const fallbackId = typeof currentQuotationId !== 'undefined' ? currentQuotationId : '-';
  const qId = normalizePdfText(quotation?.id || fallbackId || '-');
  const qStatus = normalizePdfText(String(quotation?.status || '').toUpperCase() || '-');
  const clientName = normalizePdfText(client?.name || '-');
  const clientPhone = normalizePdfText(client?.phone || '-');
  const pkg = packageLabel ? normalizePdfText(packageLabel) : '-';
  const travelFrom = normalizePdfText(client?.dateFrom || '-');
  const travelTo = client?.dateTo ? normalizePdfText(client?.dateTo) : '-';
  const paxStr = `Adults: ${client?.adults || 0}  CWB: ${client?.childBed || 0}  CNB: ${client?.childNoBed || 0}  INF: ${client?.infants || 0}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);

  doc.text(`Quotation ID: ${qId}`, M, y);
  doc.text(`Status: ${qStatus}`, M + 200, y);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-PK')}`, M + 380, y);
  y += 15;
  doc.text(`Client: ${clientName}`, M, y);
  doc.text(`Phone: ${clientPhone}`, M + 200, y);
  doc.text(`Package: ${pkg}`, M + 380, y);
  y += 15;
  doc.text(`Travel: ${travelFrom} to ${travelTo}`, M, y);
  doc.text(paxStr, M + 200, y);
  if (roe && roe.rate) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(11, 60, 120);
    doc.text(`ROE: 1 ${roe.foreignCurrency} = PKR ${formatCurrency(roe.rate)}`, M + 380, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
  }
  y += 20;

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(11, 118, 209);
  doc.setLineWidth(1);
  doc.line(M, y, M + W, y);
  y += 10;

  // ── Table columns ────────────────────────────────────────────────────────────
  const cols = [
    { title: 'Service',     width: 62  },
    { title: 'Details',     width: 230 },
    { title: 'Supplier',    width: 70  },
    { title: 'Cost',        width: 55  },
    { title: 'Svc Charge',  width: 55  },
    { title: 'Selling',     width: 55  }
  ];

  // Header row
  y = ensurePageSpace(doc, y, 26, drawHeader);
  doc.setFillColor(230, 242, 255);
  doc.rect(M, y, W, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 60, 120);
  let cx = M;
  cols.forEach((col) => {
    doc.text(col.title, cx + 4, y + 14);
    cx += col.width;
  });
  doc.setDrawColor(180, 200, 230);
  doc.setLineWidth(0.5);
  doc.line(M, y + 22, M + W, y + 22);
  y += 24;

  // ── Rows ─────────────────────────────────────────────────────────────────────
  doc.setTextColor(20, 20, 20);
  let totalCost = 0;
  let totalService = 0;
  let totalSelling = 0;
  let rowIndex = 0;

  const sortedRows = [...rows].sort((a, b) => {
    const aIsAgentFee = String(a.section || '').toLowerCase().includes('agent service fee');
    const bIsAgentFee = String(b.section || '').toLowerCase().includes('agent service fee');
    if (aIsAgentFee === bIsAgentFee) return 0;
    return aIsAgentFee ? 1 : -1;
  });

  sortedRows.forEach((row) => {
    const costVal    = parseMoney(row.cost);
    const svcVal     = parseMoney(row.service);
    const sellVal    = parseMoney(row.selling);
    totalCost    += costVal;
    totalService += svcVal;
    totalSelling += sellVal;

    const isAgentFeeRow = String(row.section || '').toLowerCase().includes('agent service fee');
    const supplierText = isAgentFeeRow ? '' : normalizePdfText(supplierMap[row.key] || '-');
    const cellValues = [
      normalizePdfText(row.section    || '-'),
      normalizePdfText(row.description || '-'),
      supplierText,
      costVal  ? formatCurrency(costVal)  : '-',
      svcVal   ? formatCurrency(svcVal)   : '-',
      sellVal  ? formatCurrency(sellVal)  : '-'
    ];

    const wrapped = cellValues.map((v, i) => {
      const textValue = String(v);
      const lines = textValue.split(/\r?\n/);
      return lines.flatMap(line => doc.splitTextToSize(line, cols[i].width - 8));
    });
    const maxLines  = Math.max(...wrapped.map((w) => w.length), 1);
    const lineH     = 12;
    const rowHeight = Math.max(24, maxLines * lineH + 8);

    y = ensurePageSpace(doc, y, rowHeight + 6, drawHeader);

    // Alternating row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 251, 255);
      doc.rect(M, y, W, rowHeight, 'F');
    }
    rowIndex++;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    cx = M;
    wrapped.forEach((lines, idx) => {
      lines.forEach((line, li) => {
        doc.text(line, cx + 4, y + 12 + li * lineH);
      });
      cx += cols[idx].width;
    });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.3);
    doc.line(M, y + rowHeight, M + W, y + rowHeight);
    y += rowHeight;
  });

  // ── Totals block ─────────────────────────────────────────────────────────────
  y = ensurePageSpace(doc, y, 110, drawHeader);
  y += 10;

  doc.setFillColor(240, 246, 255);
  doc.rect(M, y, W, 88, 'F');
  doc.setDrawColor(11, 118, 209);
  doc.setLineWidth(0.8);
  doc.rect(M, y, W, 88, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(11, 60, 120);
  doc.text('SUMMARY TOTALS', M + 8, y + 16);

  const profitPct = totalSelling ? ((totalService / totalSelling) * 100) : 0;
  const labelX  = M + 8;
  const valueX  = M + 200;
  const lh      = 17;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);

  doc.text(`Total Cost (${currencyLabel})`,          labelX, y + 16 + lh);
  doc.setFont('helvetica', 'bold');
  doc.text(`${currencyLabel} ${formatCurrency(totalCost)}`, valueX, y + 16 + lh);

  doc.setFont('helvetica', 'normal');
  doc.text(`Service Charge (${currencyLabel})`,       labelX, y + 16 + lh * 2);
  doc.setFont('helvetica', 'bold');
  doc.text(`${currencyLabel} ${formatCurrency(totalService)}`, valueX, y + 16 + lh * 2);

  doc.setFont('helvetica', 'normal');
  doc.text(`Total Selling (${currencyLabel})`,        labelX, y + 16 + lh * 3);
  doc.setFont('helvetica', 'bold');
  doc.text(`${currencyLabel} ${formatCurrency(totalSelling)}`, valueX, y + 16 + lh * 3);

  doc.setFont('helvetica', 'normal');
  doc.text('Profit Margin',                           labelX, y + 16 + lh * 4);
  doc.setFont('helvetica', 'bold');
  doc.text(`${profitPct.toFixed(2)}%`,                valueX, y + 16 + lh * 4);

  y += 98;

  // ── Footer note ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  const noteText = '* Service charge is shown per row when applicable. If no per-service charge exists, the overall service charge appears in the summary totals.';
  const noteLines = doc.splitTextToSize(noteText, W);
  doc.text(noteLines, M, y + 14);
  y += noteLines.length * 10 + 14;

  // ── Footer ────────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(11, 118, 209);
  doc.text(`Prepared By: ${normalizePdfText(agent?.name || 'Agent')}`, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Accounts Copy — Confidential', M + W - doc.getTextWidth('Accounts Copy — Confidential') - 4, y);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const safeId = typeof currentQuotationId !== 'undefined' ? currentQuotationId : 'Quotation';
  const fileName = `Accounts_Summary_${normalizePdfText(quotation?.id || safeId || 'Quotation')}.pdf`;
  doc.save(fileName);
}
