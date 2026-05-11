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
const btnScheduledReminders = document.getElementById('btnScheduledReminders');
const btnCloseReminderModal = document.getElementById('btnCloseReminderModal');
let currentNotifications = [];
let currentAgent = null;
let currentOwnerId = null;
let scheduledReminderItems = [];
let dismissedKeys = new Set();
let reminderStates = {};
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function updateScheduledReminderCount() {
  if (!btnScheduledReminders) return;
  const count = scheduledReminderItems.length;
  btnScheduledReminders.textContent = `Scheduled reminders ${count ? `(${count})` : '(0)'}`;
  btnScheduledReminders.disabled = count === 0;
}

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

async function loadNotificationSettings(ownerId) {
  const userData = await getUserDoc(ownerId);
  dismissedKeys = new Set(userData?.dismissedNotificationKeys || []);
  reminderStates = userData?.notificationReminders || {};
}

async function saveNotificationSettings(ownerId) {
  try {
    await setDoc(doc(db, 'users', ownerId), {
      dismissedNotificationKeys: Array.from(dismissedKeys),
      notificationReminders: reminderStates
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('Error saving notification settings:', error);
    showNotification('Could not save notification state to Firebase.', 'error');
    return false;
  }
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
        shareVersion: item?.shareVersion || item?.quotation?.shareVersion || null,
        ...extra
      }
    });
  } catch (error) {
    console.error('Error writing notification log:', error);
  }
}

function getDefaultReminderDelayHours(reminderCount) {
  if (reminderCount <= 1) return 48;
  return 96;
}

function formatDateTimeLocal(date) {
  const pad = value => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function scheduleReminderForItem(item, chosenDate = null) {
  if (!currentOwnerId) return false;
  const key = item.notificationKey || getNotificationKey(item);
  const currentState = reminderStates[key] || { count: 0 };
  const nextCount = (Number(currentState.count) || 0) + 1;
  const nextReminderAt = chosenDate ? chosenDate.getTime() : Date.now() + getDefaultReminderDelayHours(nextCount) * 60 * 60 * 1000;
  reminderStates[key] = {
    count: nextCount,
    nextReminderAt,
    final: nextCount >= 3
  };
  dismissedKeys.delete(key);
  return await saveNotificationSettings(currentOwnerId);
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
  const versionId = item.shareVersion || item.quotation?.shareVersion || 0;
  return `${item.quotationType}:${item.quotationId}:v${versionId}:${item.type}:${item.title}`;
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

function formatDurationText(hours) {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function buildCopyMessage(item) {
  const name = item.clientName || 'Customer';
  const quoteLabel = item.quoteLabel || 'the quotation';
  if (item.title === 'Quotation Updated After Share') {
    return `Dear ${name},\n\nI have shared an updated quotation ${quoteLabel}. Please confirm if you are interested or if any changes are required.`;
  }
  if (item.title === 'Customer Acceptance Received') {
    return `Dear ${name},\n\nPlease review the accepted quotation ${quoteLabel}. If you are interested, or if any changes are required, let me know.`;
  }
  if (item.type === 'voucher') {
    return `Dear ${name},\n\nYour booking for quotation ${quoteLabel} is being prepared. Please confirm the details or let me know if any changes are required.`;
  }
  if (item.type === 'booked') {
    return `Dear ${name},\n\nYour booking quotation ${quoteLabel} is scheduled soon. Please confirm if all details are correct or if any changes are required.`;
  }
  return `Dear ${name},\n\nPlease confirm about the quotation ${quoteLabel} I have shared. If you are interested or if any changes are required, let me know.`;
}

function renderNotificationPage(items) {
  notificationPageList.innerHTML = '';
  notificationSummary.textContent = items.length ? `${items.length} reminder${items.length === 1 ? '' : 's'} generated` : 'No reminders at the moment.';
  pageInfo.textContent = `Notifications loaded from Firebase for ${currentAgent?.name || 'this user'}.`;

  if (!items.length) {
    notificationPageList.innerHTML = '<div class="notification-page-empty">All clear. No urgent follow-ups or voucher reminders.</div>';
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'notification-card-grid';

  items.forEach((item, index) => {
    const itemKey = item.notificationKey || getNotificationKey(item);
    const reminderState = reminderStates[itemKey];
    const typeText = item.type?.toUpperCase() || 'GENERAL';
    const quotationText = item.quotationId ? `${item.quotationType?.toUpperCase() || 'TYPE'} #${item.quotationId}` : 'N/A';
    const clientText = item.clientName || 'Unknown';
    const messageText = item.message + (reminderState?.final ? ' (FINAL REMINDER)' : '');
    const reminderText = reminderState?.nextReminderAt ? `${reminderState.final ? 'Final' : 'Next'} reminder · ${new Date(reminderState.nextReminderAt).toLocaleString()}` : 'Immediate';

    const card = document.createElement('article');
    card.className = 'notification-card';
    if (reminderState?.final) card.classList.add('notification-card-final');

    const header = document.createElement('div');
    header.className = 'notification-card-header';

    const titleBlock = document.createElement('div');
    titleBlock.innerHTML = `
      <div class="notification-card-title">${item.title || 'Notification'}</div>
      <div class="notification-card-meta">${quotationText}</div>
    `;

    const badge = document.createElement('span');
    badge.className = `notification-card-badge ${item.type || 'general'}`;
    badge.textContent = typeText;

    header.appendChild(titleBlock);
    header.appendChild(badge);

    const body = document.createElement('div');
    body.className = 'notification-card-body';

    const messageBlock = document.createElement('div');
    messageBlock.className = 'notification-card-message';
    messageBlock.textContent = messageText;

    const details = document.createElement('div');
    details.className = 'notification-card-details';
    const createDetail = (label, value) => {
      const detail = document.createElement('div');
      detail.className = 'notification-detail';
      detail.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
      return detail;
    };

    details.appendChild(createDetail('Client', clientText));
    details.appendChild(createDetail('Reminder', reminderText));

    const footer = document.createElement('div');
    footer.className = 'notification-card-footer';

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

    if (item.type === 'followup' || item.type === 'approval') {
      addAction('Copy number', () => copyTextToClipboard(item.contactNumber || ''), !item.contactNumber);
      addAction('Copy message', () => copyTextToClipboard(buildCopyMessage(item)));
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

    const reminderRow = document.createElement('div');
    reminderRow.className = 'notification-reminder-row';
    reminderRow.style.display = 'none';

    const reminderInput = document.createElement('input');
    reminderInput.type = 'datetime-local';
    reminderInput.className = 'notification-reminder-input';
    const nextCount = (reminderState?.count || 0) + 1;
    const defaultReminder = new Date(Date.now() + getDefaultReminderDelayHours(nextCount) * 60 * 60 * 1000);
    reminderInput.value = formatDateTimeLocal(defaultReminder);

    const saveReminderBtn = document.createElement('button');
    saveReminderBtn.type = 'button';
    saveReminderBtn.className = 'btn-secondary';
    saveReminderBtn.textContent = 'Schedule reminder';
    saveReminderBtn.addEventListener('click', async () => {
      const selectedDate = reminderInput.value ? new Date(reminderInput.value) : null;
      if (!selectedDate || Number.isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
        showNotification('Please choose a future reminder date and time.', 'warning');
        return;
      }
      const saved = await scheduleReminderForItem(item, selectedDate);
      if (saved) {
        const key = item.notificationKey || getNotificationKey(item);
        item.reminderState = reminderStates[key];
        currentNotifications.splice(index, 1);
        scheduledReminderItems.push(item);
        renderNotificationPage(currentNotifications);
        updateScheduledReminderCount();
        if (!document.getElementById('scheduledReminderModal')?.hidden) {
          renderScheduledReminderModal();
        }
        showNotification(`Reminder scheduled for ${selectedDate.toLocaleString()}`, 'success');
        await logNotificationAction(currentOwnerId, item, 'notification_snoozed', { reminderCount: reminderStates[key]?.count || 0, nextReminderAt: reminderStates[key]?.nextReminderAt });
      }
    });

    reminderRow.appendChild(reminderInput);
    reminderRow.appendChild(saveReminderBtn);
    addAction('Remind later', () => {
      reminderRow.style.display = reminderRow.style.display === 'flex' ? 'none' : 'flex';
    });

    footer.appendChild(actions);
    footer.appendChild(reminderRow);

    body.appendChild(messageBlock);
    body.appendChild(details);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    grid.appendChild(card);
  });

  notificationPageList.appendChild(grid);
}

function getReminderButtonLabel(item) {
  return item.reminderState?.final ? 'Final reminder' : 'Scheduled reminder';
}

function renderScheduledReminderModal() {
  const modal = document.getElementById('scheduledReminderModal');
  const modalBody = document.getElementById('scheduled-reminder-body');
  const countLabel = document.getElementById('scheduled-reminder-count');
  if (!modalBody || !countLabel) return;

  countLabel.textContent = `${scheduledReminderItems.length} scheduled reminder${scheduledReminderItems.length === 1 ? '' : 's'}`;
  modalBody.innerHTML = '';

  if (!scheduledReminderItems.length) {
    modalBody.innerHTML = '<div class="notification-page-empty">No scheduled reminders at the moment.</div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'notification-card-grid';

  scheduledReminderItems.forEach((item, index) => {
    const reminderText = item.reminderState?.nextReminderAt ? new Date(item.reminderState.nextReminderAt).toLocaleString() : 'Unknown';
    const card = document.createElement('article');
    card.className = 'notification-card';

    const header = document.createElement('div');
    header.className = 'notification-card-header';
    header.innerHTML = `
      <div>
        <div class="notification-card-title">${item.title || 'Scheduled reminder'}</div>
        <div class="notification-card-meta">${item.quotationType?.toUpperCase() || 'TYPE'} #${item.quotationId || 'N/A'}</div>
      </div>
      <span class="notification-card-badge ${item.type || 'general'}">${item.type?.toUpperCase() || 'GENERAL'}</span>
    `;

    const body = document.createElement('div');
    body.className = 'notification-card-body';
    body.innerHTML = `
      <div class="notification-card-message">${item.message}</div>
      <div class="notification-card-details">
        <div class="notification-detail"><strong>Client</strong><span>${item.clientName || 'Unknown'}</span></div>
        <div class="notification-detail"><strong>${getReminderButtonLabel(item)}</strong><span>${reminderText}</span></div>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'notification-card-footer';
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

    if (item.type === 'voucher') {
      addAction('Open voucher', () => openVoucherForNotification(item));
    } else if (item.quotationId && item.quotationType) {
      addAction('Open quotation', () => openQuotationForNotification(item));
    }
    addAction('Copy message', () => copyTextToClipboard(buildCopyMessage(item)));
    addAction('Mark done early', async () => {
      await markReminderDoneByItem(item);
      renderScheduledReminderModal();
      renderNotificationPage(currentNotifications);
    });

    footer.appendChild(actions);
    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    list.appendChild(card);
  });

  modalBody.appendChild(list);
}

function toggleScheduledReminderModal(show = true) {
  const modal = document.getElementById('scheduledReminderModal');
  if (!modal) return;
  modal.hidden = !show;
  if (show) renderScheduledReminderModal();
}

async function markReminderDoneByItem(item) {
  if (!item) return;
  const saved = await scheduleReminderForItem(item);
  if (!saved) return;

  const key = item.notificationKey || getNotificationKey(item);
  const nextReminderAt = reminderStates[key]?.nextReminderAt;
  await loadNotifications();
  updateScheduledReminderCount();
  const modal = document.getElementById('scheduledReminderModal');
  if (modal && !modal.hidden) renderScheduledReminderModal();
  showNotification(`Reminder rescheduled for ${new Date(nextReminderAt).toLocaleString()}`, 'success');
  await logNotificationAction(currentOwnerId, item, 'notification_snoozed', { reminderCount: reminderStates[key]?.count || 0, nextReminderAt });
}

async function markNotificationDone(index) {
  if (index < 0 || index >= currentNotifications.length) return;
  await markReminderDoneByItem(currentNotifications[index]);
}

function getNotificationBase(q) {
  return {
    quotationId: q.id,
    quotationType: q.type,
    ownerId: q.agentId || currentOwnerId,
    contactNumber: q.clientData?.phone || q.clientData?.mobile || q.clientData?.contact || q.clientData?.phoneNumber || '',
    clientName: q.clientData?.name || '',
    quoteLabel: `#${q.id} (${q.type || 'quotation'})`,
    shareVersion: q.shareVersion || 0,
    quotation: q
  };
}

function isCurrentQuotationVersion(quotation) {
  if (!quotation) return false;
  return quotation.isCurrent !== false && String(quotation.status || '').toLowerCase() !== 'superseded';
}

async function computeNotifications(quotations) {
  const now = new Date();
  const notifications = [];
  const scheduled = [];

  await Promise.all(quotations.map(async (q) => {
    const base = getNotificationBase(q);
    const voucherId = await findVoucherIdForQuotation(q);
    const createdAt = parseDateValue(q.createdAt || q.updatedAt);
    const updatedAt = parseDateValue(q.updatedAt || q.createdAt);
    const dateFrom = parseDateValue(q.clientData?.dateFrom || q.dateFrom || q.travelFrom);
    const status = String(q.status || '').toLowerCase();
    const effectiveStatus = q.agentApproval?.approvedAt ? 'booked' : status;
    const clientName = base.clientName || 'client';

    const pushNotification = (title, message, type) => {
      const item = { ...base, title, message, type };
      const key = getNotificationKey(item);
      const reminderState = reminderStates[key];
      if (dismissedKeys.has(key)) return;
      if (reminderState?.nextReminderAt && now.getTime() < reminderState.nextReminderAt) {
        scheduled.push({ ...item, notificationKey: key, reminderState });
        return;
      }
      item.notificationKey = key;
      item.reminderState = reminderState;
      notifications.push(item);
    };

    if (createdAt) {
      const hoursSinceCreate = Math.floor((now - createdAt) / (1000 * 60 * 60));
      if (hoursSinceCreate >= 24 && !['booked', 'cancelled', 'expired', 'followup'].includes(effectiveStatus)) {
        const durationText = formatDurationText(hoursSinceCreate);
        pushNotification(
          'Follow-up Reminder',
          `Quotation ${base.quoteLabel} for ${clientName} was created ${durationText} ago and still not moved to Follow Up. Please contact the client.`,
          'followup'
        );
      }
    }

    if (effectiveStatus === 'followup' && updatedAt) {
      const hoursSinceFollowup = Math.floor((now - updatedAt) / (1000 * 60 * 60));
      if (hoursSinceFollowup >= 24) {
          const durationText = formatDurationText(hoursSinceFollowup);
          pushNotification(
            'Follow-up Status Pending',
            `Quotation ${base.quoteLabel} for ${clientName} has been on Follow Up for ${durationText}. Review and update its status.`,
            'followup'
          );
      }
    }

    if (q.customerAcceptance && !q.agentApproval?.approvedAt) {
      pushNotification(
        'Customer Acceptance Received',
        `Customer has accepted quotation ${base.quoteLabel} for ${clientName}. Review the acceptance and approve the booking.`,
        'approval'
      );
    }

    if (q.shareLinkId && q.customerNeedsReaccept) {
      pushNotification(
        'Quotation Updated After Share',
        `Quotation ${base.quoteLabel} was updated after sharing. Ask the customer to review and accept the latest quotation.`,
        'followup'
      );
    }

    if (effectiveStatus === 'booked' && dateFrom) {
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

  return { notifications, scheduled };
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
    await loadNotificationSettings(currentOwnerId);
    const snapshot = await loadQuotationsFromFirebase(currentOwnerId);

    const allQuotations = [
      ...(snapshot.umrah || []).map(q => ({ ...q, type: 'umrah' })),
      ...(snapshot.international || []).map(q => ({ ...q, type: 'international' })),
      ...(snapshot.domestic || []).map(q => ({ ...q, type: 'domestic' }))
    ].filter(isCurrentQuotationVersion);

    const computed = await computeNotifications(allQuotations);
    currentNotifications = computed.notifications;
    scheduledReminderItems = computed.scheduled;
    renderNotificationPage(currentNotifications);
    updateScheduledReminderCount();

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
if (btnScheduledReminders) {
  btnScheduledReminders.addEventListener('click', () => toggleScheduledReminderModal(true));
}
if (btnCloseReminderModal) {
  btnCloseReminderModal.addEventListener('click', () => toggleScheduledReminderModal(false));
}
document.addEventListener('DOMContentLoaded', loadNotifications);

