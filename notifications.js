import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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
const auth = getAuth(app);

const notificationSummary = document.getElementById('notificationSummary');
const notificationPageList = document.getElementById('notificationPageList');
const pageInfo = document.getElementById('pageInfo');
const btnBack = document.getElementById('btnBack');
const btnRefresh = document.getElementById('btnRefresh');
let currentNotifications = [];
let currentAgent = null;
let currentOwnerId = null;
let dismissedKeys = new Set();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = 'position:fixed;top:20px;right:20px;padding:15px 20px;border-radius:5px;color:white;font-weight:bold;z-index:1000;transition:opacity 0.3s;';
  notification.style.backgroundColor = type === 'error' ? '#e74c3c' : type === 'success' ? '#28a745' : type === 'warning' ? '#f39c12' : '#17a2b8';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => { notification.style.opacity = '0'; setTimeout(() => document.body.removeChild(notification), 300); }, 3000);
}

function parseDateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDaysBetween(start, end) {
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

function isSessionExpired() {
  const now = Date.now();
  const explicitExpiry = Number(localStorage.getItem('sessionExpiresAt') || '0');
  const loginTime = Number(localStorage.getItem('loginTime') || '0');

  if (explicitExpiry > 0) {
    return now > explicitExpiry;
  }
  if (loginTime > 0) {
    return now - loginTime > SESSION_TTL_MS;
  }
  return true;
}

function getSessionAgent() {
  const rawAgent = localStorage.getItem('loggedInAgent');
  if (!rawAgent) return null;
  try {
    return JSON.parse(rawAgent);
  } catch (e) {
    return null;
  }
}

function waitForFirebaseAuthSession(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (window.location.protocol === 'file:' || !auth || !onAuthStateChanged) {
      resolve(auth.currentUser || null);
      return;
    }

    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    let settled = false;
    let unsubscribe = () => {};
    const finish = (user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user || null);
    };

    const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
    unsubscribe = onAuthStateChanged(auth, (user) => finish(user), () => finish(null));
  });
}

async function initAgent() {
  const agent = getSessionAgent();
  if (agent && !isSessionExpired()) {
    return agent;
  }
  const user = await waitForFirebaseAuthSession();
  if (!user) return null;
  return {
    id: user.uid,
    uid: user.uid,
    name: user.displayName || user.email || 'Agent'
  };
}

function getOwnerId(agent) {
  return agent?.uid || agent?.id || null;
}

async function getUserDoc(ownerId) {
  try {
    const snap = await getDoc(doc(db, 'users', ownerId));
    return snap.exists() ? snap.data() : null;
  } catch (error) {
    console.error('Error loading user document:', error);
    showNotification('Could not load notification settings from Firebase.', 'error');
    return null;
  }
}

async function loadDismissedNotificationKeys(ownerId) {
  const userData = await getUserDoc(ownerId);
  return new Set(userData?.dismissedNotificationKeys || []);
}

async function saveDismissedNotificationKeys(ownerId, keys) {
  try {
    await setDoc(doc(db, 'users', ownerId), { dismissedNotificationKeys: Array.from(keys) }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error saving dismissed notification keys:', error);
    showNotification('Could not save notification state to Firebase.', 'error');
    return false;
  }
}

async function logNotificationAction(ownerId, item, action, extra = {}) {
  if (!ownerId || !action) return;
  try {
    await addDoc(collection(db, 'users', ownerId, 'notificationLogs'), {
      userId: ownerId,
      action,
      quotationId: item?.quotationId || null,
      quotationType: item?.quotationType || null,
      notificationType: item?.type || null,
      title: item?.title || null,
      message: item?.message || null,
      timestamp: serverTimestamp(),
      details: {
        clientName: item?.clientName || null,
        contactNumber: item?.contactNumber || null,
        ...extra
      }
    });
  } catch (error) {
    console.error('Error writing notification log:', error);
  }
}

async function getQuotationDoc(collectionName, ownerId) {
  try {
    const snap = await getDoc(doc(db, collectionName, ownerId));
    return snap.exists() ? snap.data().quotations || [] : [];
  } catch (error) {
    console.error(`Error loading ${collectionName}:`, error);
    showNotification(`Could not load ${collectionName} from Firebase.`, 'error');
    return [];
  }
}

async function loadQuotationsFromFirebase(ownerId) {
  const [umrah, international, domestic] = await Promise.all([
    getQuotationDoc('umrah_quotations', ownerId),
    getQuotationDoc('international_quotations', ownerId),
    getQuotationDoc('domestic_quotations', ownerId)
  ]);
  return { umrah, international, domestic };
}

async function findVoucherIdForQuotation(quotation) {
  if (!quotation || !quotation.id || !quotation.type) return '';
  let collectionName = 'vouchers';
  if (quotation.type === 'domestic') collectionName = 'domestic_vouchers';
  if (quotation.type === 'international') collectionName = 'int_vouchers';

  try {
    const voucherQuery = query(collection(db, collectionName), where('quotationId', '==', quotation.id));
    const voucherSnapshot = await getDocs(voucherQuery);
    return voucherSnapshot.docs.length ? voucherSnapshot.docs[0].id : '';
  } catch (error) {
    console.error('Error querying voucher collection:', error);
    return '';
  }
}

function getNotificationKey(item) {
  return `${item.quotationType}:${item.quotationId}:${item.type}:${item.title}`;
}

function copyTextToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showNotification('Copied to clipboard.', 'success'));
  } else {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('Copied to clipboard.', 'success');
  }
}

function getQuotationUrl(item) {
  if (!item.quotationId || !item.quotationType) return '';
  if (item.quotationType === 'umrah') return `index.html?edit=${encodeURIComponent(item.quotationId)}`;
  if (item.quotationType === 'domestic') return `Domestic Quotation Tool.html?edit=${encodeURIComponent(item.quotationId)}`;
  return `International Quotation Tool.html?edit=${encodeURIComponent(item.quotationId)}`;
}

function getVoucherUrl(item) {
  if (!item.quotationId || !item.quotationType) return '';
  if (item.quotationType === 'umrah') return `voucher.html?quotationId=${encodeURIComponent(item.quotationId)}`;
  if (item.quotationType === 'domestic') return `domestic-voucher.html?quotationId=${encodeURIComponent(item.quotationId)}`;
  return `int-voucher.html?quotationId=${encodeURIComponent(item.quotationId)}`;
}

function openQuotationForNotification(item) {
  const url = getQuotationUrl(item);
  if (url) {
    logNotificationAction(currentOwnerId, item, 'open_quotation');
    window.open(url, '_blank');
  }
}

function openVoucherForNotification(item) {
  const url = getVoucherUrl(item);
  if (url) {
    logNotificationAction(currentOwnerId, item, 'open_voucher');
    window.open(url, '_blank');
  }
}

function buildFollowupMessage(item) {
  const name = item.clientName || 'Customer';
  return `Dear ${name},\n\nYour quotation ${item.quoteLabel || ''} needs follow-up. Please contact the client and update the quotation status.`;
}

function renderNotificationPage(items) {
  notificationPageList.innerHTML = '';
  notificationSummary.textContent = items.length ? `${items.length} reminder${items.length === 1 ? '' : 's'} generated` : 'No reminders at the moment.';
  pageInfo.textContent = `Notifications loaded from Firebase for ${currentAgent?.name || 'this user'}.`;

  if (!items.length) {
    notificationPageList.innerHTML = '<div class="notification-page-empty">All clear. No urgent follow-ups or voucher reminders.</div>';
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'notification-page-card';
    const metaParts = [item.quotationType?.toUpperCase(), item.quotationId ? `ID: ${item.quotationId}` : '', item.clientName, item.contactNumber].filter(Boolean);
    const meta = metaParts.join(' • ');
    const visibleTitle = item.clientName ? `${item.title} — ${item.clientName}` : item.title;

    card.innerHTML = `
      <div class="notification-card-header">
        <strong>${visibleTitle}</strong>
        <span class="notification-card-meta">${meta}</span>
      </div>
      <p>${item.message}</p>
    `;

    const actions = document.createElement('div');
    actions.className = 'notification-action-group';
    const addAction = (label, callback, disabled = false) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener('click', callback);
      actions.appendChild(btn);
    };

    if (item.type === 'followup') {
      addAction('Copy number', () => copyTextToClipboard(item.contactNumber || ''), !item.contactNumber);
      addAction('Copy message', () => copyTextToClipboard(buildFollowupMessage(item)));
      addAction('Mark done', () => markNotificationDone(index));
    } else if (item.type === 'booked') {
      addAction('Open quotation', () => openQuotationForNotification(item));
      addAction('Mark done', () => markNotificationDone(index));
    } else if (item.type === 'voucher') {
      addAction('Open voucher form', () => openVoucherForNotification(item));
      addAction('Mark done', () => markNotificationDone(index));
    } else {
      if (item.quotationId && item.quotationType) addAction('Open quotation', () => openQuotationForNotification(item));
      addAction('Mark done', () => markNotificationDone(index));
    }

    card.appendChild(actions);
    notificationPageList.appendChild(card);
  });
}

async function markNotificationDone(index) {
  if (index < 0 || index >= currentNotifications.length) return;
  const item = currentNotifications[index];
  dismissedKeys.add(getNotificationKey(item));
  const saved = await saveDismissedNotificationKeys(currentOwnerId, dismissedKeys);
  if (!saved) return;
  await logNotificationAction(currentOwnerId, item, 'notification_done');
  currentNotifications.splice(index, 1);
  renderNotificationPage(currentNotifications);
  showNotification('Notification marked done.', 'success');
}

function getNotificationBase(q) {
  return {
    quotationId: q.id,
    quotationType: q.type,
    ownerId: q.agentId || currentOwnerId,
    contactNumber: q.clientData?.phone || q.clientData?.mobile || q.clientData?.contact || q.clientData?.phoneNumber || '',
    clientName: q.clientData?.name || '',
    quoteLabel: `#${q.id} (${q.type || 'quotation'})`,
    quotation: q
  };
}

async function computeNotifications(quotations) {
  const now = new Date();
  const notifications = [];

  await Promise.all(quotations.map(async (q) => {
    const base = getNotificationBase(q);
    const voucherId = await findVoucherIdForQuotation(q);
    const createdAt = parseDateValue(q.createdAt || q.updatedAt);
    const updatedAt = parseDateValue(q.updatedAt || q.createdAt);
    const dateFrom = parseDateValue(q.clientData?.dateFrom || q.dateFrom || q.travelFrom);
    const status = String(q.status || '').toLowerCase();
    const clientName = base.clientName || 'client';

    const pushNotification = (title, message, type) => {
      const item = { ...base, title, message, type };
      const key = getNotificationKey(item);
      if (!dismissedKeys.has(key)) {
        notifications.push(item);
      }
    };

    if (createdAt) {
      const hoursSinceCreate = Math.floor((now - createdAt) / (1000 * 60 * 60));
      if (hoursSinceCreate >= 24 && !['booked', 'cancelled', 'expired', 'followup'].includes(status)) {
        pushNotification(
          'Follow-up Reminder',
          `Quotation ${base.quoteLabel} for ${clientName} was created ${hoursSinceCreate} hours ago and still not moved to Follow Up. Please contact the client.`,
          'followup'
        );
      }
    }

    if (status === 'followup' && updatedAt) {
      const hoursSinceFollowup = Math.floor((now - updatedAt) / (1000 * 60 * 60));
      if (hoursSinceFollowup >= 24) {
        pushNotification(
          'Follow-up Status Pending',
          `Quotation ${base.quoteLabel} for ${clientName} has been on Follow Up for ${hoursSinceFollowup} hours. Review and update its status.`,
          'followup'
        );
      }
    }

    if (status === 'booked' && dateFrom) {
      const daysToTravel = getDaysBetween(now, dateFrom);
      if (daysToTravel <= 15 && daysToTravel >= 0 && !voucherId) {
        pushNotification(
          'Create Voucher',
          `Booked quotation ${base.quoteLabel} for ${clientName} departs in ${daysToTravel} day${daysToTravel === 1 ? '' : 's'} and no voucher exists yet. Create the voucher before travel.`,
          'booked'
        );
      }
      if (daysToTravel <= 3 && daysToTravel >= 0) {
        pushNotification(
          'Travel Imminent',
          `Quotation ${base.quoteLabel} for ${clientName} has travel in ${daysToTravel} day${daysToTravel === 1 ? '' : 's'}. Make sure the voucher and service details are ready.`,
          'booked'
        );
      }
    }

    if (voucherId && dateFrom) {
      const hoursToTravel = Math.floor((dateFrom - now) / (1000 * 60 * 60));
      if (hoursToTravel <= 24 && hoursToTravel >= 0) {
        pushNotification(
          'Voucher Data Check',
          `Voucher for quotation ${base.quoteLabel} (${clientName}) departs within 24 hours. Verify hotel, transfer, tour and driver details and update any TBA fields.`,
          'voucher'
        );
      }
    }
  }));

  return notifications;
}

async function loadNotifications() {
  try {
    pageInfo.textContent = 'Loading notifications from Firebase...';
    currentAgent = await initAgent();
    if (!currentAgent) {
      pageInfo.textContent = 'Login required. Sign in through the dashboard to load Firebase notifications.';
      return;
    }

    currentOwnerId = getOwnerId(currentAgent);
    dismissedKeys = await loadDismissedNotificationKeys(currentOwnerId);
    const snapshot = await loadQuotationsFromFirebase(currentOwnerId);

    const allQuotations = [
      ...(snapshot.umrah || []).map(q => ({ ...q, type: 'umrah' })),
      ...(snapshot.international || []).map(q => ({ ...q, type: 'international' })),
      ...(snapshot.domestic || []).map(q => ({ ...q, type: 'domestic' }))
    ];

    currentNotifications = await computeNotifications(allQuotations);
    renderNotificationPage(currentNotifications);

    if (!allQuotations.length) {
      pageInfo.textContent = 'No quotations found for this agent in Firebase.';
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
    pageInfo.textContent = 'Unable to load notifications from Firebase.';
    showNotification('Could not load notifications from Firebase.', 'error');
  }
}

if (btnBack) {
  btnBack.addEventListener('click', () => { window.location.href = 'dashboard.html'; });
}
if (btnRefresh) {
  btnRefresh.addEventListener('click', async () => { pageInfo.textContent = 'Refreshing notifications...'; await loadNotifications(); showNotification('Notifications refreshed.', 'success'); });
}
document.addEventListener('DOMContentLoaded', loadNotifications);

