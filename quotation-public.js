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

const collectionMap = {
  umrah: 'umrah_quotations',
  domestic: 'domestic_quotations',
  international: 'international_quotations'
};

function setMessage(text, type = 'info') {
  if (!quoteMessage) return;
  quoteMessage.textContent = text;
  quoteMessage.className = `message ${type}`;
  quoteMessage.style.display = 'block';
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
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

function renderQuotation() {
  if (!quotationDoc) return;
  const q = quotationDoc;
  const hasAccepted = q.customerAcceptance && !q.agentApproval;
  const isBooked = q.status === 'booked';
  const shareVersion = q.shareVersion || 1;

  const customerAccepted = !!q.customerAcceptance;
  btnAcceptQuotation.style.display = (!isBooked && !customerAccepted) ? 'inline-flex' : 'none';
  btnOpenTerms.style.display = q.terms ? 'inline-flex' : 'none';

  const termsText = q.terms || q.termsAndConditions || q.customTerms || q.termsText || 'Terms and conditions are not available for this quotation.';
  customerTermsEl.value = termsText;

  quotationContent.innerHTML = `
    <div class="quote-row"><label>Quotation Number</label><div>${sanitize(q.id)}</div></div>
    <div class="quote-row"><label>Quotation Type</label><div>${sanitize(quotationType || q.type || 'Unknown')}</div></div>
    <div class="quote-row"><label>Status</label><div>${sanitize(q.status || 'pending')}</div></div>
    <div class="quote-row"><label>Version</label><div>${shareVersion}</div></div>
    <div class="quote-row"><label>Last Updated</label><div>${formatDate(q.shareUpdatedAt || q.updatedAt || q.createdAt)}</div></div>
    <div class="quote-row"><label>Client Name</label><div>${sanitize(q.clientData?.name || q.clientData?.fullName || '-')}</div></div>
    <div class="quote-row"><label>Phone</label><div>${sanitize(q.clientData?.phone || q.clientData?.mobile || '-')}</div></div>
    <div class="quote-row"><label>From</label><div>${sanitize(q.clientData?.dateFrom || q.dateFrom || q.travelFrom || '-')}</div></div>
    <div class="quote-row"><label>To</label><div>${sanitize(q.clientData?.dateTo || q.dateTo || q.travelTo || '-')}</div></div>
    <div class="quote-row"><label>Created At</label><div>${formatDate(q.createdAt)}</div></div>
    ${buildCustomerAcceptanceSection(q)}
    ${buildApprovalSection(q)}
  `;

  if (isBooked) {
    setMessage('This quotation is already booked and cannot be accepted again.', 'success');
  } else if (hasAccepted) {
    setMessage('The customer has already accepted the quotation and is waiting for agent approval.', 'info');
  } else if (q.customerNeedsReaccept) {
    setMessage('This quotation was updated after sharing. Please review and accept the latest terms again.', 'warning');
  } else {
    setMessage('This quotation is ready for customer acceptance. Price breakdown is hidden for security.', 'info');
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

loadQuotationFromFirebase();
