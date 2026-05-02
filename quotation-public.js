import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDx3Qxt84vJlz_-mXuxiC0W2flaLadr9Ws",
  authDomain: "fc-quotation-tool.firebaseapp.com",
  projectId: "fc-quotation-tool",
  storageBucket: "fc-quotation-tool.firebasestorage.app",
  messagingSenderId: "370566945624",
  appId: "1:370566945624:web:a84b20d5a8f99d20a6e32d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pageInfo = document.getElementById('pageInfo');
const quoteMessage = document.getElementById('quoteMessage');
const quotationContent = document.getElementById('quotationContent');
const btnAcceptQuotation = document.getElementById('btnAcceptQuotation');
const btnOpenTerms = document.getElementById('btnOpenTerms');
const acceptModal = document.getElementById('acceptModal');
const customerNameEl = document.getElementById('customerName');
const customerPhoneEl = document.getElementById('customerPhone');
const customerTermsEl = document.getElementById('customerTerms');
const customerAcceptCheck = document.getElementById('customerAcceptCheck');
const btnCancelAccept = document.getElementById('btnCancelAccept');
const btnSubmitAccept = document.getElementById('btnSubmitAccept');

const params = new URLSearchParams(window.location.search);
const quotationType = params.get('type');
const quotationId = params.get('id');
const quotationKey = params.get('key');
let quotationDoc = null;
let quotationCollection = null;

const publicAcceptanceReminder = `By accepting this quotation, I confirm that I have:

- Read and understood the quotation details
- Checked all inclusions and exclusions
- Verified the total amount
- Confirmed travel dates and all provided information
- Confirmed the number of passengers

Important:
Accepting this quotation does not mean booking is confirmed with Flight Connection Travel & Tours. Our agent will check availability and contact you.

Booking will only be confirmed after:
- Availability is verified
- Full payment is received

This action will be treated as my consent and agreement with Flight Connection Travel & Tours.`;

const collectionMap = {
  umrah: 'umrah_quotations',
  domestic: 'domestic_quotations',
  international: 'international_quotations'
};

function setMessage(text, type = 'info') {
  if (!quoteMessage) return;
  quoteMessage.innerHTML = sanitize(text).replace(/\n/g, '<br>');
  quoteMessage.className = `message ${type}`;
  quoteMessage.style.display = 'block';
}

function formatEditLogDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function buildPublicReviewMessage(quotation) {
  const baseMessage = 'Review the quotation preview and accept if everything is correct.';
  const hadAcceptedBefore = !!quotation?.lastCustomerAcceptance;
  if (!hadAcceptedBefore) return baseMessage;

  const logs = Array.isArray(quotation?.publicEditLog)
    ? quotation.publicEditLog.filter(item => item && item.label && item.at)
    : [];
  if (!logs.length) return baseMessage;

  const detailLines = logs.slice(-8).map(item => `${item.label} on ${formatEditLogDate(item.at)}`);
  return `${baseMessage}\n\n${detailLines.join('\n')}`;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatCurrency(value, currencyCode = 'PKR') {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(String(value).replace(/[^0-9.-]+/g, ''));
  if (Number.isNaN(number)) return sanitize(value);
  const code = String(currencyCode || 'PKR').toUpperCase().trim() || 'PKR';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(number);
  } catch (error) {
    return `${number.toLocaleString()} ${sanitize(code)}`;
  }
}

function renderRow(label, value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap;">
      <div style="color:#333;font-weight:700;min-width:140px;">${sanitize(label)}</div>
      <div style="color:#444;flex:1;min-width:120px;">${sanitize(value)}</div>
    </div>`;
}

function renderSection(title, content) {
  if (!content) return '';
  return `
    <div style="margin-bottom:20px;border:1px solid #eee;padding:18px;border-radius:10px;">
      <h2 style="margin:0 0 12px;color:#0b76d1;font-size:18px;">${sanitize(title)}</h2>
      ${content}
    </div>`;
}

function renderCollapsibleSection(title, content, sectionId, open = false) {
  const id = sectionId || `section-${Math.random().toString(36).slice(2, 8)}`;
  return `
    <div class="collapsible-section">
      <div class="collapsible-header" role="button" tabindex="0" data-target="${id}">
        <span>${sanitize(title)}</span>
        <button type="button" class="toggle-section" data-target="${id}" aria-expanded="${open}">${open ? 'Hide' : 'Show'}</button>
      </div>
      <div id="${id}" class="collapsible-content${open ? ' active' : ''}">
        ${content}
      </div>
    </div>`;
}

function getItineraryItemTitle(item, index) {
  if (!item) return `Day ${index}`;
  if (typeof item === 'string') return `Day ${index}`;
  const day = item.day || item.dayNumber || item.dayNo || item.dayLabel;
  const label = item.title || item.name || item.description || '';
  if (day) return `Day ${day}${label ? `: ${label}` : ''}`;
  if (item.title) return item.title;
  return `Day ${index}`;
}

function getItineraryItemDescription(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  const parts = [];
  if (item.description) parts.push(item.description);
  if (item.details) parts.push(item.details);
  if (item.notes) parts.push(item.notes);
  if (item.location) parts.push(`Location: ${item.location}`);
  if (item.activity) parts.push(item.activity);
  return parts.join(' ') || JSON.stringify(item);
}

function getDaywiseItineraryRows(quotation) {
  const rawRows = Array.isArray(quotation.itineraryData?.rows)
    ? quotation.itineraryData.rows
    : Array.isArray(quotation.itineraryRows)
      ? quotation.itineraryRows
      : Array.isArray(quotation.daywiseItinerary)
        ? quotation.daywiseItinerary
        : Array.isArray(quotation.itinerary)
          ? quotation.itinerary
          : [];
  if (!rawRows || !rawRows.length) return [];

  return rawRows.map((item, index) => {
    if (typeof item === 'string') {
      return {
        day: index + 1,
        date: '',
        activity: item,
        meals: 'No Meals'
      };
    }

    if (typeof item === 'object' && item !== null) {
      return {
        day: item.day || item.dayNumber || item.dayNo || item.dayLabel || index + 1,
        date: item.date || item.dayDate || item.travelDate || item.dayDate || '',
        activity: item.activity || item.title || item.name || item.description || '',
        meals: item.meals || item.mealsIncluded || item.meal || 'No Meals'
      };
    }

    return {
      day: index + 1,
      date: '',
      activity: String(item),
      meals: 'No Meals'
    };
  }).filter(row => row.activity || row.date);
}

function buildDaywiseItinerarySection(quotation) {
  const rows = getDaywiseItineraryRows(quotation);
  if (!rows.length) return '';

  const tableHtml = (window.ItineraryComponent && typeof window.ItineraryComponent.renderItineraryTable === 'function')
    ? window.ItineraryComponent.renderItineraryTable(rows, { editable: false })
    : `<div style="color:#444;line-height:1.7;">Day wise itinerary details are available.</div>`;

  return `
    <div id="itinerarySectionWrapper" style="margin-bottom:12px;border:1px solid #eee;padding:10px 12px;border-radius:6px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <h3 style="margin:0;color:#0b76d1;border-bottom:2px solid #0b76d1;padding-bottom:3px;">Day Wise Itinerary</h3>
        <button id="toggleItineraryBtn" type="button" class="blue-btn" style="padding:4px 10px;font-size:12px;">Show Itinerary</button>
      </div>
      <div id="itineraryTableContainer" style="display:none;margin-top:8px;">${tableHtml}</div>
    </div>`;
}

function buildItinerarySection(quotation) {
  return buildDaywiseItinerarySection(quotation);
}

function renderDataRows(fields) {
  return fields.map(([label, value]) => renderRow(label, value)).join('');
}

function renderList(title, items) {
  if (!items || !items.length) return '';
  const listItems = items.map(item => `<li style="margin-bottom:6px;color:#444;">${sanitize(item)}</li>`).join('');
  return `
    <div style="margin-bottom:10px;">
      <div style="font-weight:700;color:#333;margin-bottom:8px;">${sanitize(title)}</div>
      <ul style="padding-left:18px;margin:0;">${listItems}</ul>
    </div>`;
}

function normalizeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return [String(value)];
}

function buildServiceSection(quotation) {
  const blocks = [];
  if (quotation.addons && Array.isArray(quotation.addons) && quotation.addons.length) {
    blocks.push(renderSection('Add-ons', renderList('Add-on items', quotation.addons.map(item => item.name || item.title || JSON.stringify(item)))));
  }
  if (quotation.services && Array.isArray(quotation.services) && quotation.services.length) {
    blocks.push(renderSection('Service Details', renderList('Services', quotation.services.map(item => item.name || item.title || JSON.stringify(item)))));
  }
  if (quotation.flightSegments && Array.isArray(quotation.flightSegments) && quotation.flightSegments.length) {
    blocks.push(renderSection('Flight Segments', renderList('Flights', quotation.flightSegments.map(seg => seg.description || `${seg.from || seg.departure || ''} → ${seg.to || seg.arrival || ''}`.trim() || JSON.stringify(seg)))));
  }
  if (quotation.flights && Array.isArray(quotation.flights) && quotation.flights.length) {
    blocks.push(renderSection('Flight Details', renderList('Flights', quotation.flights.map(f => f.number || f.route || JSON.stringify(f)))));
  }
  if (quotation.hotels && Array.isArray(quotation.hotels) && quotation.hotels.length) {
    blocks.push(renderSection('Hotel Details', renderList('Hotels', quotation.hotels.map(h => h.name || `${h.city || ''} ${h.rooms ? `(${h.rooms} rooms)` : ''}`.trim() || JSON.stringify(h)))));
  }
  if (quotation.hotelDetails && typeof quotation.hotelDetails === 'object') {
    blocks.push(renderSection('Hotel Details', renderDataRows(Object.entries(quotation.hotelDetails).map(([key, value]) => [key, Array.isArray(value) ? normalizeArray(value).join(', ') : value]))));
  }
  if (quotation.itinerary && typeof quotation.itinerary === 'string') {
    blocks.push(renderSection('Itinerary', `<div style="color:#444;line-height:1.7;">${sanitize(quotation.itinerary)}</div>`));
  }
  return blocks.join('') || '';
}

function buildQuotation() {
  const q = quotationDoc || {};
  const client = q.clientData || q.customer || {};
  const travelFrom = client.dateFrom || q.dateFrom || q.travelFrom || '-';
  const travelTo = client.dateTo || q.dateTo || q.travelTo || '-';
  const depCity = client.depCity || client.departureCity || q.depCity || q.departureCity || '-';
  const destination = client.tourDestination || q.tourDestination || q.travelDestination || '-';
  const passengerSummary = [
    `Adults: ${client.adults || 0}`,
    client.childBed ? `Child with Bed: ${client.childBed}` : null,
    client.childNoBed ? `Child without Bed: ${client.childNoBed}` : null,
    client.infants ? `Infants: ${client.infants}` : null,
  ].filter(Boolean).join(' · ');

  const header = `
    <div style="text-align:center;margin-bottom:18px;">
      <div style="font-size:22px;font-weight:700;color:#0b76d1;">Flight Connection Travel & Tours</div>
      <div style="font-size:14px;color:#555;margin-top:6px;">Quotation Preview</div>
    </div>`;

  const summaryRows = renderDataRows([
    ['Quotation Number', q.id || quotationId],
    ['Quotation Type', quotationType || q.type || 'Unknown'],
    ['Status', q.status || 'pending'],
    ['Version', q.shareVersion || 1],
    ['Last Updated', formatDate(q.shareUpdatedAt || q.updatedAt || q.createdAt)]
  ]);

  const clientRows = renderDataRows([
    ['Client Name', client.name || client.fullName || '-'],
    ['Phone', client.phone || client.mobile || client.contact || '-'],
    ['Email', client.email || client.emailAddress || '-'],
    ['Reference', client.reference || '-']
  ]);

  const travelRows = renderDataRows([
    ['Destination', destination],
    ['Travel Dates', `${sanitize(travelFrom)} — ${sanitize(travelTo)}`],
    ['Departure City', depCity],
    ['Passengers', passengerSummary || '-']
  ]);

  const priceTotalsHidden = !!(q.hidePrice || q.isPriceHidden || q.priceHidden);
  const priceBreakdownHidden = !!q.hidePriceBreakdown;
  const currency = q.currency || q.currencyCode || 'PKR';
  const priceLines = [];
  if (q.grandTotalPKR != null) priceLines.push(['Grand Total', formatCurrency(q.grandTotalPKR, currency)]);
  if (q.finalTotalSellPKR != null) priceLines.push(['Final Total', formatCurrency(q.finalTotalSellPKR, currency)]);
  if (q.totalAmount != null) priceLines.push(['Total Amount', formatCurrency(q.totalAmount, currency)]);
  if (q.grandTotal != null && q.grandTotal !== q.grandTotalPKR) priceLines.push(['Grand Total', formatCurrency(q.grandTotal, currency)]);
  if (q.packageTotalPKR != null) priceLines.push(['Package Total', formatCurrency(q.packageTotalPKR, currency)]);
  if (q.packageTotalAmount != null) priceLines.push(['Package Total', formatCurrency(q.packageTotalAmount, currency)]);
  const priceSection = !priceTotalsHidden && priceLines.length ? renderSection('Pricing', renderDataRows(priceLines)) : '';

  let breakdownSection = '';
  const breakdownItems = q.priceBreakdown || q.calculationSummary || q.priceDetails || q.priceBreakup || q.breakdown || null;
  if (!priceBreakdownHidden && breakdownItems) {
    if (Array.isArray(breakdownItems)) {
      breakdownSection = renderSection('Price Breakdown', renderList('Breakdown', breakdownItems.map(item => item.description || item.title || JSON.stringify(item))));
    } else if (typeof breakdownItems === 'object') {
      breakdownSection = renderSection('Price Breakdown', renderDataRows(Object.entries(breakdownItems).map(([key, value]) => [key, Array.isArray(value) ? normalizeArray(value).join(', ') : value])));
    } else {
      breakdownSection = renderSection('Price Breakdown', `<div style="color:#444;line-height:1.6;">${sanitize(String(breakdownItems))}</div>`);
    }
  }

  const packageSection = (q.packageSelection || q.package || q.packageName) ? renderSection('Package Details', renderDataRows([
    ['Package', q.packageSelection?.name || q.package?.name || q.packageName || '-'],
    ['Package ID', q.packageSelection?.id || q.package?.id || '-'],
    ['Package Notes', q.packageSelection?.description || q.package?.description || '-']
  ])) : '';

  const serviceSection = buildServiceSection(q);
  const daywiseSection = buildDaywiseItinerarySection(q);

  return `${header}${renderSection('Quotation Summary', summaryRows)}${renderSection('Client Details', clientRows)}${renderSection('Travel Details', travelRows)}${packageSection}${serviceSection}${daywiseSection}${priceSection}${breakdownSection}`;
}

function buildCustomerAcceptanceSection(quotation) {
  if (!quotation.customerAcceptance) return '';
  return `
    <div style="margin-top:16px;padding:14px;background:#f0f7ef;border:1px solid #c8dfc6;border-radius:10px;">
      <strong>Customer Accepted:</strong><br>
      Name: ${quotation.customerAcceptance.name || '-'}<br>
      Phone: ${quotation.customerAcceptance.phone || '-'}<br>
      Accepted At: ${formatDate(quotation.customerAcceptance.acceptedAt)}<br>
      Version: ${quotation.customerAcceptance.shareVersion || quotation.shareVersion || 1}
    </div>
  `;
}

function buildApprovalSection(quotation) {
  if (!quotation.agentApproval) return '';
  return `
    <div style="margin-top:16px;padding:14px;background:#eef7ff;border:1px solid #c3d9f4;border-radius:10px;">
      <strong>Agent Approval:</strong><br>
      Approved By: ${quotation.agentApproval.approvedByName || quotation.agentApproval.approvedBy || '-'}<br>
      Terms Accepted: ${quotation.agentApproval.termsAccepted ? 'Yes' : 'No'}<br>
      Approved At: ${formatDate(quotation.agentApproval.approvedAt)}
    </div>
  `;
}

function sanitize(value) {
  if (value === null || value === undefined) return '-';
  return String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function getGeneratedDaywiseRows(quotation) {
  if (!window.ItineraryComponent || typeof window.ItineraryComponent.generateItinerary !== 'function') return [];
  try {
    const generated = await window.ItineraryComponent.generateItinerary({
      clientData: quotation?.clientData || quotation?.customer || {},
      hotels: Array.isArray(quotation?.hotels) ? quotation.hotels : [],
      transfers: Array.isArray(quotation?.transfers) ? quotation.transfers : [],
      tours: Array.isArray(quotation?.tours) ? quotation.tours : [],
      flightSegments: quotation?.itineraryFlightSegments || quotation?.itineraryData?.flightSegments || {}
    });
    return Array.isArray(generated?.rows) ? generated.rows : [];
  } catch (error) {
    console.error('Error generating public itinerary rows:', error);
    return [];
  }
}

async function ensurePublicItineraryTableContent(container, quotation) {
  if (!container) return false;
  if (container.innerHTML.trim()) return true;

  let rows = getDaywiseItineraryRows(quotation);
  if (!rows.length) {
    rows = await getGeneratedDaywiseRows(quotation);
  }

  if (!rows.length) {
    container.innerHTML = `<div style="color:#666;line-height:1.7;">No day wise itinerary available.</div>`;
    return false;
  }

  container.innerHTML = (window.ItineraryComponent && typeof window.ItineraryComponent.renderItineraryTable === 'function')
    ? window.ItineraryComponent.renderItineraryTable(rows, { editable: false })
    : `<div style="color:#444;line-height:1.7;">Day wise itinerary details are available.</div>`;
  return true;
}

function attachSnapshotItineraryToggle() {
  const toggleBtn = quotationContent.querySelector('#toggleItineraryBtn');
  const container = quotationContent.querySelector('#itineraryTableContainer');
  const section = quotationContent.querySelector('#itinerarySectionWrapper');
  if (!toggleBtn || !container) return;

  if (!container.style.display) {
    container.style.display = 'none';
  }
  toggleBtn.textContent = container.style.display === 'none' ? 'Show Itinerary' : 'Hide Itinerary';
  if (section) {
    section.classList.toggle('itinerary-hidden', container.style.display === 'none');
  }

  toggleBtn.addEventListener('click', async () => {
    const isHidden = container.style.display === 'none';
    if (isHidden) {
      await ensurePublicItineraryTableContent(container, quotationDoc || {});
    }
    container.style.display = isHidden ? 'block' : 'none';
    toggleBtn.textContent = isHidden ? 'Hide Itinerary' : 'Show Itinerary';
    if (section) {
      section.classList.toggle('itinerary-hidden', !isHidden);
    }
  });
}

function renderQuotation() {
  if (!quotationDoc) return;
  const q = quotationDoc;
  const isBooked = q.status === 'booked';
  const customerAccepted = !!q.customerAcceptance;
  btnAcceptQuotation.style.display = (!isBooked && !customerAccepted) ? 'inline-flex' : 'none';
  btnOpenTerms.style.display = q.terms ? 'inline-flex' : 'none';

  const termsText = q.terms || q.termsAndConditions || q.customTerms || q.termsText || 'Terms and conditions are not available for this quotation.';
  customerTermsEl.value = [termsText.trim(), publicAcceptanceReminder].filter(Boolean).join('\n\n');

  const sharedSnapshot = typeof q.publicQuotationHtml === 'string' ? q.publicQuotationHtml.trim() : '';
  quotationContent.innerHTML = sharedSnapshot || buildQuotation();

  if (sharedSnapshot) {
    let itinerarySection = quotationContent.querySelector('#itinerarySectionWrapper');
    if (!itinerarySection) {
      const daywiseHtml = buildDaywiseItinerarySection(q);
      if (daywiseHtml) {
        const serviceHeading = Array.from(quotationContent.querySelectorAll('h2, h3'))
          .find(h => h.textContent.trim().toLowerCase() === 'service details');
        if (serviceHeading && serviceHeading.parentElement) {
          serviceHeading.parentElement.insertAdjacentHTML('afterend', daywiseHtml);
        } else {
          quotationContent.insertAdjacentHTML('beforeend', daywiseHtml);
        }
      }
      itinerarySection = quotationContent.querySelector('#itinerarySectionWrapper');
    }

    const itineraryContainer = quotationContent.querySelector('#itineraryTableContainer');
    if (itinerarySection && itineraryContainer && !itineraryContainer.innerHTML.trim()) {
      ensurePublicItineraryTableContent(itineraryContainer, q).then(() => {
        itineraryContainer.style.display = 'none';
      });
    }
  }

  attachSnapshotItineraryToggle();

  if (isBooked) {
    setMessage('This quotation is already booked and cannot be accepted again.', 'success');
  } else if (q.customerNeedsReaccept) {
    setMessage(buildPublicReviewMessage(q), 'warning');
  } else if (customerAccepted) {
    setMessage('Quotation accepted by customer. Waiting for agent approval.', 'info');
  } else {
    setMessage('Review the quotation preview and accept if everything is correct.', 'info');
  }
}

function getCollectionByType(type) {
  return collectionMap[type] || null;
}

async function getQuotationLinkDoc(linkKey) {
  try {
    const snap = await getDoc(doc(db, 'quotation_links', linkKey));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error('Error loading share link:', error);
    return null;
  }
}

async function loadQuotationFromFirebase() {
  if (!quotationType || !quotationId || !quotationKey) {
    pageInfo.textContent = 'Invalid quotation link. Please verify the URL.';
    btnAcceptQuotation.style.display = 'none';
    return;
  }

  try {
    const linkDoc = await getQuotationLinkDoc(quotationKey);
    if (!linkDoc) {
      pageInfo.textContent = 'Quotation link is not valid or has been changed.';
      btnAcceptQuotation.style.display = 'none';
      return;
    }

    if (linkDoc.type !== quotationType || linkDoc.quotationId !== quotationId) {
      pageInfo.textContent = 'Quotation link does not match the requested quotation. Please verify the URL.';
      btnAcceptQuotation.style.display = 'none';
      return;
    }

    if (!linkDoc.quotation) {
      pageInfo.textContent = 'Quotation data is unavailable for this link.';
      btnAcceptQuotation.style.display = 'none';
      return;
    }

    quotationDoc = { id: linkDoc.quotationId, ...linkDoc.quotation };
    pageInfo.textContent = `Quotation loaded: ${sanitize(quotationDoc.id)}`;
    renderQuotation();
  } catch (error) {
    console.error('Error loading quotation:', error);
    pageInfo.textContent = 'Failed to load quotation. Please try again later.';
    btnAcceptQuotation.style.display = 'none';
  }
}

function openAcceptModal() {
  customerNameEl.value = quotationDoc.customerAcceptance?.name || '';
  customerPhoneEl.value = quotationDoc.customerAcceptance?.phone || '';
  customerAcceptCheck.checked = false;
  acceptModal.classList.add('active');
}

function closeAcceptModal() {
  acceptModal.classList.remove('active');
}

async function submitCustomerAcceptance() {
  const name = customerNameEl.value.trim();
  const phone = customerPhoneEl.value.trim();
  const accepted = customerAcceptCheck.checked;
  if (!name || !phone) {
    alert('Please enter both name and phone number.');
    return;
  }
  if (!accepted) {
    alert('You must accept the terms and conditions before proceeding.');
    return;
  }

  const now = new Date().toISOString();
  const updatedQuotation = {
    ...quotationDoc,
    updatedAt: now,
    customerAcceptance: {
      name,
      phone,
      acceptedAt: now,
      shareVersion: quotationDoc.shareVersion || 1
    },
    lastCustomerAcceptance: {
      name,
      phone,
      acceptedAt: now,
      shareVersion: quotationDoc.shareVersion || 1
    },
    publicEditLog: [],
    status: 'pending',
    customerNeedsReaccept: false,
    agentApproval: quotationDoc.agentApproval || null
  };

  try {
    const linkDoc = await getQuotationLinkDoc(quotationKey);
    const ownerId = linkDoc?.ownerId;

    await setDoc(doc(db, 'quotation_links', quotationKey), {
      quotationId,
      type: quotationType,
      ownerId,
      quotation: updatedQuotation,
      shareVersion: updatedQuotation.shareVersion,
      shareUpdatedAt: updatedQuotation.shareUpdatedAt
    }, { merge: true });

    if (ownerId) {
      const ownerCollection = getCollectionByType(quotationType);
      if (ownerCollection) {
        const ownerDocRef = doc(db, ownerCollection, ownerId);
        const ownerDocSnap = await getDoc(ownerDocRef);
        if (ownerDocSnap.exists()) {
          const ownerData = ownerDocSnap.data();
          const updatedQuotations = (ownerData.quotations || []).map((q) => q.id === quotationId ? updatedQuotation : q);
          await setDoc(ownerDocRef, { quotations: updatedQuotations }, { merge: true });
        }
      }
    }

    quotationDoc = updatedQuotation;
    closeAcceptModal();
    renderQuotation();
    setMessage('Quotation accepted. Your agent has been notified.', 'success');
  } catch (error) {
    console.error('Error saving acceptance:', error);
    alert('Could not submit acceptance. Please try again.');
  }
}

btnAcceptQuotation.addEventListener('click', openAcceptModal);
btnOpenTerms.addEventListener('click', () => {
  acceptModal.classList.add('active');
});
btnCancelAccept.addEventListener('click', closeAcceptModal);
btnSubmitAccept.addEventListener('click', submitCustomerAcceptance);

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!target.matches('.toggle-section')) return;
  const sectionId = target.dataset.target;
  const panel = document.getElementById(sectionId);
  if (!panel) return;
  const isOpen = panel.classList.toggle('active');
  target.textContent = isOpen ? 'Hide' : 'Show';
  target.setAttribute('aria-expanded', isOpen);
});

loadQuotationFromFirebase();
