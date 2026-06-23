(function () {
 const PAGE_CONFIGS = [
 {
 match: /Domestic\s*Quotation\s*Tool\.html/i,
 type: "domestic",
 storageKey: "savedQuotations_domestic",
 firebaseCollection: "domestic_quotations",
 prefix: "DOM",
 label: "Domestic"
 },
 {
 match: /International\s*Quotation\s*Tool\.html/i,
 type: "international",
 storageKey: "savedQuotations_international",
 firebaseCollection: "international_quotations",
 prefix: "INT",
 label: "International"
 },
 {
 match: /index\.html/i,
 type: "umrah",
 storageKey: "savedQuotations",
 firebaseCollection: "umrah_quotations",
 prefix: "UMH",
 label: "Umrah"
 }
 ];

 const pageName = decodeURIComponent(location.pathname.split("/").pop() || "");
 const config = PAGE_CONFIGS.find(item => item.match.test(pageName));
 if (!config) return;

 let lastRenderedQuotationId = "";
 let clientPaxDirty = false;
 let clientPaxSnapshot = "";
 const CLIENT_PAX_FIELD_IDS = [
 "clientName",
 "reference",
 "refExtra",
 "clientPhone",
 "depCity",
 "numAdult",
 "numChildBed",
 "numChildNoBed",
 "numInfant",
 "dateFrom",
 "dateTo",
 "nightsMakkah",
 "nightsMadina",
 "tourDestination"
 ];
 const CLIENT_PAX_BLOCKED_BUTTON_IDS = [
 "btnSaveQuotation",
 "btnCalculate",
 "btnRecalculate",
 "btnGenerateQuotation",
 "btnExportExcel",
 "btnDownloadAccountsPdf",
 "btnCreateVoucher",
 "btnEditVoucher",
 "btnUpdateStatus",
 "btnApproveCustomer",
 "btnSelfBook"
 ];

 function safeJsonArray(value) {
 try {
 const parsed = JSON.parse(value || "[]");
 return Array.isArray(parsed) ? parsed : [];
 } catch (error) {
 return [];
 }
 }

 function getAllQuotations() {
 return normalizeQuotationVersions(safeJsonArray(localStorage.getItem(config.storageKey)));
 }

 function setAllQuotations(rows) {
 const normalized = normalizeQuotationVersions(rows);
 localStorage.setItem(config.storageKey, JSON.stringify(normalized));
 try {
 savedQuotations = normalized;
 } catch (error) {
 // Some pages keep the list in a lexical binding. localStorage remains the source of truth.
 }
 return normalized;
 }

 function getCurrentId() {
 try {
 return currentQuotationId || "";
 } catch (error) {
 return "";
 }
 }

 function setCurrentId(id) {
 try {
 currentQuotationId = id;
 } catch (error) {
 // Ignore; the page load function will set it on normal load.
 }
 }

 function getCurrentAgentSafe() {
 try {
 return typeof getCurrentAgent === "function" ? getCurrentAgent() : null;
 } catch (error) {
 return null;
 }
 }

 function getOwnerId(quotation) {
 const agent = getCurrentAgentSafe();
 return quotation?.ownerId ||
 quotation?.agentId ||
 quotation?.userId ||
 quotation?.agentData?.id ||
 quotation?.agentData?.uid ||
 quotation?.agentData?.userId ||
 agent?.id ||
 agent?.uid ||
 null;
 }

 function getOwnerIds(quotation) {
 return Array.from(new Set([
 quotation?.ownerId,
 quotation?.agentId,
 quotation?.userId,
 quotation?.agentData?.id,
 quotation?.agentData?.uid,
 quotation?.agentData?.userId
 ].filter(Boolean)));
 }

 function getRootId(quotation) {
 if (!quotation) return "";
 if (quotation.rootQuotationId) return quotation.rootQuotationId;
 const id = String(quotation.id || "");
 return id.replace(/-R\d+$/i, "");
 }

 function getRevisionNumber(quotation) {
 if (!quotation) return 0;
 if (Number.isFinite(Number(quotation.revisionNumber))) return Number(quotation.revisionNumber);
 const match = String(quotation.id || "").match(/-R(\d+)$/i);
 return match ? Number(match[1]) : 0;
 }

function normalizeQuotationVersions(rows) {
 return (rows || []).map(row => {
 if (!row || !row.id) return row;
 const rootQuotationId = getRootId(row);
 const revisionNumber = getRevisionNumber(row);
 const status = String(row.status || "").toLowerCase();
 return {
 ...row,
 rootQuotationId,
 revisionNumber,
 isCurrent: row.isCurrent === false || status === "superseded" ? false : true
 };
 });
}

function getRevisionRowTimestamp(row) {
 const timestamp = new Date(row?.updatedAt || row?.revisedAt || row?.createdAt || 0).getTime();
 return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeRevisionRowsById(serverRows, localRows) {
 const byId = new Map();
 [...(serverRows || []), ...(localRows || [])].forEach(row => {
 if (!row || !row.id) return;
 const existing = byId.get(row.id);
 if (!existing || getRevisionRowTimestamp(row) >= getRevisionRowTimestamp(existing)) {
 byId.set(row.id, row);
 }
 });
 return Array.from(byId.values());
}

 function getCurrentQuotation() {
 const id = getCurrentId();
 if (!id) return null;
 return getAllQuotations().find(q => q?.id === id) || null;
 }

 function getFamily(rootId) {
 return getAllQuotations()
 .filter(q => q && getRootId(q) === rootId)
 .sort((a, b) => getRevisionNumber(a) - getRevisionNumber(b));
 }

 function getNextRevisionNumber(rootId) {
 const maxRevision = getFamily(rootId).reduce((max, q) => Math.max(max, getRevisionNumber(q)), 0);
 return maxRevision + 1;
 }

 function makeRevisionId(rootId, revisionNumber) {
 return `${rootId}-R${revisionNumber}`;
 }

 function formatRevisionLabel(quotation) {
 if (!quotation) return "No quotation loaded";
 const revisionNumber = getRevisionNumber(quotation);
 const currentText = quotation.isCurrent === false ? "Superseded" : "Current";
 return `${revisionNumber === 0 ? "Original" : `R${revisionNumber}`} ${currentText}`;
 }

 function makeNewRevisionFrom(source, options = {}) {
 const now = new Date().toISOString();
 const rootQuotationId = getRootId(source);
 const revisionNumber = getNextRevisionNumber(rootQuotationId);
 const id = makeRevisionId(rootQuotationId, revisionNumber);
 const restoredFromQuotationId = options.restoredFromQuotationId || null;
 const revisionReason = options.revisionReason || "";

 const copy = JSON.parse(JSON.stringify(source));
 delete copy.shareLinkId;
 delete copy.sharePublicUrl;
 delete copy.shareVersion;
 delete copy.shareUpdatedAt;
 delete copy.publicQuotationHtml;
 delete copy.publicQuotationSnapshotAt;
 delete copy.customerAcceptance;
 delete copy.lastCustomerAcceptance;
 delete copy.agentApproval;
 delete copy.customerNeedsReaccept;
 delete copy.supersededBy;

 return {
 ...copy,
 id,
 rootQuotationId,
 parentQuotationId: source.id,
 restoredFromQuotationId,
 revisionNumber,
 revisionReason,
 isCurrent: true,
 status: "pending",
 createdAt: now,
 updatedAt: now,
 revisedAt: now,
 revisionType: restoredFromQuotationId ? "restore" : "revision"
 };
 }

 async function saveQuotationLinkSnapshot(quotation) {
 if (!quotation?.shareLinkId || !window.firebaseDB) return;
 const ownerId = getOwnerId(quotation);
 const client = quotation.clientData || {};
 const agent = quotation.agentData || {};
 const quotationNumber = quotation.quotationNumber || quotation.displayNumber || quotation.id || "";
 const clientName = client.name || quotation.clientName || "";
 const clientPhone = client.phone || quotation.clientPhone || "";
 const agentName = agent.name || quotation.agentName || "";
 const payload = {
 quotationId: quotation.id,
 quotationNumber,
 displayNumber: quotationNumber,
 type: config.type,
 quotationType: config.type,
 ownerId,
 agentId: ownerId,
 userId: ownerId,
 clientName,
 clientPhone,
 agentName,
 agentPhone: agent.phone || quotation.agentPhone || "",
 firebaseLabel: [config.type, quotationNumber, clientName, agentName].filter(Boolean).join(" | "),
 ownerLabel: [agentName, ownerId].filter(Boolean).join(" | "),
 quotation,
 shareVersion: quotation.shareVersion || 1,
 shareUpdatedAt: quotation.shareUpdatedAt || quotation.updatedAt || new Date().toISOString()
 };
 if (typeof window.saveFirebaseDataWithRetry === "function") {
 await window.saveFirebaseDataWithRetry("quotation_links", quotation.shareLinkId, payload, "Revision share link update error");
 return;
 }
 await window.firebaseDB.saveData("quotation_links", quotation.shareLinkId, payload).catch(err => console.error("Revision share link update error:", err));
 }

async function persistRevisionRows(rows, ownerQuotation) {
 const normalized = setAllQuotations(rows);
 const ownerId = getOwnerId(ownerQuotation);
 if (ownerId && window.firebaseDB) {
 const ownerRows = normalized.filter(row => getOwnerIds(row).includes(ownerId));
 const payload = {
 quotations: ownerRows,
 updatedAt: new Date(),
 agentId: ownerId,
 userId: ownerId,
 agentName: ownerQuotation?.agentData?.name || ownerQuotation?.agentName || "",
 firebaseLabel: [config.type, "quotations", ownerQuotation?.agentData?.name || ownerQuotation?.agentName || ownerId].filter(Boolean).join(" | ")
 };
 if (window.db && window.runTransaction && typeof window.doc === "function") {
 try {
 const ref = window.doc(window.db, config.firebaseCollection, ownerId);
 await window.runTransaction(window.db, async (transaction) => {
 const snap = await transaction.get(ref);
 const snapData = typeof snap?.data === "function" ? snap.data() : (snap?.data || {});
 const serverRows = snap && (typeof snap.exists === "function" ? snap.exists() : snap.exists)
 ? (Array.isArray(snapData?.quotations) ? snapData.quotations : [])
 : [];
 const mergedRows = mergeRevisionRowsById(serverRows, ownerRows);
 transaction.set(ref, { ...payload, quotations: mergedRows, updatedAt: new Date() }, { merge: true });
 });
 } catch (err) {
 console.error("Revision Firebase save error:", err);
 }
 } else {
 await window.firebaseDB.saveData(config.firebaseCollection, ownerId, payload).catch(err => console.error("Revision Firebase save error:", err));
 }
 }
 return normalized;
}

 function notify(message, type = "info") {
 if (typeof showNotification === "function") {
 showNotification(message, type);
 } else {
 alert(message);
 }
 }

 function getClientPaxSnapshot() {
 return JSON.stringify(CLIENT_PAX_FIELD_IDS.map(id => {
 const el = document.getElementById(id);
 return [id, el ? String(el.value || "") : ""];
 }));
 }

 function getClientPaxSection() {
 return document.getElementById("clientPaxSection") ||
 Array.from(document.querySelectorAll(".section")).find(section =>
 /client\s*&\s*pax/i.test(section.textContent || "")
 ) ||
 null;
 }

 function setClientPaxDirty(isDirty, options = {}) {
 clientPaxDirty = !!isDirty;
 if (!clientPaxDirty || options.captureSnapshot) {
 clientPaxSnapshot = getClientPaxSnapshot();
 }
 updateClientPaxGuardUi();
 }

 function hasClientPaxUnsavedChanges() {
 return clientPaxDirty && clientPaxSnapshot !== getClientPaxSnapshot();
 }

 function getClientPaxGuardMessage() {
 return "Client & Pax was changed. Please click Save Client & Pax before continuing.";
 }

 function updateClientPaxGuardUi() {
 const section = getClientPaxSection();
 if (!section) return;
 let notice = document.getElementById("clientPaxRevisionGuardNotice");
 if (!notice) {
 notice = document.createElement("div");
 notice.id = "clientPaxRevisionGuardNotice";
 notice.className = "small";
 notice.style.cssText = "display:none;margin-top:10px;padding:10px 12px;border:1px solid #f1c27d;background:#fff7e6;color:#7a4b00;border-radius:8px;font-weight:700;";
 section.appendChild(notice);
 }
 const dirty = hasClientPaxUnsavedChanges();
 notice.textContent = dirty ? getClientPaxGuardMessage() : "";
 notice.style.display = dirty ? "block" : "none";
 }

 function markClientPaxDirtyIfChanged() {
 if (clientPaxSnapshot && clientPaxSnapshot !== getClientPaxSnapshot()) {
 clientPaxDirty = true;
 }
 updateClientPaxGuardUi();
 }

 function syncClientPaxSnapshotAfterSave() {
 window.setTimeout(() => {
 const saved = typeof isClientDataSaved !== "undefined" ? !!isClientDataSaved : true;
 if (saved) {
 setClientPaxDirty(false, { captureSnapshot: true });
 }
 }, 250);
 }

 function blockIfClientPaxDirty(event) {
 const target = event.target?.closest?.("button");
 if (!target || !CLIENT_PAX_BLOCKED_BUTTON_IDS.includes(target.id)) return;
 if (!hasClientPaxUnsavedChanges()) return;
 event.preventDefault();
 event.stopPropagation();
 event.stopImmediatePropagation();
 notify(getClientPaxGuardMessage(), "warning");
 const section = getClientPaxSection();
 section?.scrollIntoView({ behavior: "smooth", block: "start" });
 }

 function initClientPaxGuard() {
 clientPaxSnapshot = getClientPaxSnapshot();
 CLIENT_PAX_FIELD_IDS.forEach(id => {
 const el = document.getElementById(id);
 if (!el || el.dataset.revisionGuardAttached === "1") return;
 el.dataset.revisionGuardAttached = "1";
 el.addEventListener("input", markClientPaxDirtyIfChanged);
 el.addEventListener("change", markClientPaxDirtyIfChanged);
 });
 document.getElementById("btnSaveClient")?.addEventListener("click", syncClientPaxSnapshotAfterSave);
 document.addEventListener("click", blockIfClientPaxDirty, true);
 updateClientPaxGuardUi();
 }

 function confirmText(message, fallback = "") {
 const value = prompt(message, fallback);
 return value === null ? null : value.trim();
 }

 async function createRevisionFromCurrent() {
 const current = getCurrentQuotation();
 if (!current) {
 notify("Please save or load a quotation before creating a revision.", "warning");
 return;
 }
 if (current.isCurrent === false || String(current.status || "").toLowerCase() === "superseded") {
 notify("This is an old version. Use Restore as New Revision from history.", "warning");
 return;
 }

 const reason = confirmText("Reason for this revision? Example: hotel change, nights changed, updated rates.");
 if (reason === null) return;

 const rows = getAllQuotations();
 const rootId = getRootId(current);
 const now = new Date().toISOString();
 const newRevision = makeNewRevisionFrom(current, { revisionReason: reason });
 const updatedRows = rows.map(row => {
 if (!row || getRootId(row) !== rootId) return row;
 const superseded = {
 ...row,
 rootQuotationId: rootId,
 isCurrent: false,
 status: "superseded",
 supersededBy: newRevision.id,
 supersededAt: now,
 updatedAt: now
 };
 return superseded;
 });

 updatedRows.push(newRevision);
 await persistRevisionRows(updatedRows, current);
 const oldCurrent = updatedRows.find(q => q.id === current.id);
 await saveQuotationLinkSnapshot(oldCurrent);
 setCurrentId(newRevision.id);
 setClientPaxDirty(false, { captureSnapshot: true });
 notify(`Revision ${newRevision.id} created. It is now pending and current.`, "success");
 if (typeof loadQuotation === "function") {
 await loadQuotation(newRevision.id);
 }
 window.setTimeout(() => setClientPaxDirty(false, { captureSnapshot: true }), 400);
 renderRevisionPanel();
 }

 async function restoreAsNewRevision(sourceId) {
 const rows = getAllQuotations();
 const source = rows.find(q => q?.id === sourceId);
 if (!source) {
 notify("Version not found.", "error");
 return;
 }

 const reason = confirmText(`Restore ${source.id} as a new current revision? Add a reason.`, "Restored previous version");
 if (reason === null) return;

 const rootId = getRootId(source);
 const now = new Date().toISOString();
 const newRevision = makeNewRevisionFrom(source, {
 revisionReason: reason,
 restoredFromQuotationId: source.id
 });

 const updatedRows = rows.map(row => {
 if (!row || getRootId(row) !== rootId) return row;
 return {
 ...row,
 rootQuotationId: rootId,
 isCurrent: false,
 status: "superseded",
 supersededBy: newRevision.id,
 supersededAt: now,
 updatedAt: now
 };
 });

 updatedRows.push(newRevision);
 await persistRevisionRows(updatedRows, source);
 await Promise.all(updatedRows.filter(q => getRootId(q) === rootId && q.shareLinkId).map(saveQuotationLinkSnapshot));
 closeHistoryModal();
 setCurrentId(newRevision.id);
 setClientPaxDirty(false, { captureSnapshot: true });
 notify(`${newRevision.id} restored as the current pending revision.`, "success");
 if (typeof loadQuotation === "function") {
 await loadQuotation(newRevision.id);
 }
 window.setTimeout(() => setClientPaxDirty(false, { captureSnapshot: true }), 400);
 renderRevisionPanel();
 }

 function loadVersion(sourceId) {
 closeHistoryModal();
 if (typeof loadQuotation === "function") {
 loadQuotation(sourceId);
 window.setTimeout(() => {
 setClientPaxDirty(false, { captureSnapshot: true });
 renderRevisionPanel();
 }, 300);
 }
 }

 function ensurePanel() {
 if (document.getElementById("quotationRevisionPanel")) return;
 const anchor = document.getElementById("btnDashboard") || document.getElementById("btnLoadQuotation") || document.getElementById("btnSaveQuotation");
 if (!anchor) return;

 const pageHeader = anchor.closest(".page-header") || anchor.parentNode;
 if (!pageHeader || !pageHeader.parentNode) return;

 const panel = document.createElement("div");
 panel.id = "quotationRevisionPanel";
 panel.className = "no-print";
 panel.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;width:100%;";
 panel.innerHTML = `
 <span id="quotationRevisionBadge" class="small" style="font-weight:700;color:#0b76d1;"></span>
 <button id="btnCreateRevision" type="button" class="ghost">Create Revision</button>
 <button id="btnVersionHistory" type="button" class="ghost">Version History</button>
 `;
 pageHeader.parentNode.insertBefore(panel, pageHeader.nextSibling);

 document.getElementById("btnCreateRevision").addEventListener("click", createRevisionFromCurrent);
 document.getElementById("btnVersionHistory").addEventListener("click", openHistoryModal);
 }

 function ensureHistoryModal() {
 if (document.getElementById("quotationHistoryModal")) return;
 const modal = document.createElement("div");
 modal.id = "quotationHistoryModal";
 modal.className = "modal-overlay no-print";
 modal.innerHTML = `
 <div class="modal-content" style="max-width:820px;width:96%;text-align:left;">
 <h3 style="margin:0 0 10px;">Version History</h3>
 <div id="quotationHistoryBody" style="max-height:60vh;overflow:auto;"></div>
 <div class="actions" style="justify-content:flex-end;margin-top:14px;">
 <button id="btnCloseHistoryModal" type="button" class="ghost">Close</button>
 </div>
 </div>
 `;
 document.body.appendChild(modal);
 document.getElementById("btnCloseHistoryModal").addEventListener("click", closeHistoryModal);
 }

 function openHistoryModal() {
 const current = getCurrentQuotation();
 if (!current) {
 notify("Please save or load a quotation first.", "warning");
 return;
 }
 ensureHistoryModal();
 renderHistoryRows(current);
 const modal = document.getElementById("quotationHistoryModal");
 modal.classList.add("visible");
 modal.classList.add("active");
 }

 function closeHistoryModal() {
 const modal = document.getElementById("quotationHistoryModal");
 if (!modal) return;
 modal.classList.remove("visible");
 modal.classList.remove("active");
 }

 function renderHistoryRows(current) {
 const body = document.getElementById("quotationHistoryBody");
 const family = getFamily(getRootId(current));
 body.innerHTML = `
 <table style="width:100%;border-collapse:collapse;">
 <thead>
 <tr>
 <th>Quotation</th>
 <th>Version</th>
 <th>Status</th>
 <th>Reason</th>
 <th>Updated</th>
 <th>Actions</th>
 </tr>
 </thead>
 <tbody>
 ${family.map(row => {
 const rev = getRevisionNumber(row);
 const versionText = rev === 0 ? "Original" : `R${rev}`;
 const stateText = row.isCurrent === false ? "Superseded" : "Current";
 const reason = row.revisionReason || (row.restoredFromQuotationId ? `Restored from ${row.restoredFromQuotationId}` : "-");
 const updated = row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "-";
 const restoreButton = row.isCurrent === false
 ? `<button type="button" class="ghost" data-restore-id="${row.id}">Restore as New Revision</button>`
 : `<span class="small">Current</span>`;
 return `
 <tr>
 <td>${row.id}</td>
 <td>${versionText}</td>
 <td>${stateText}</td>
 <td>${reason}</td>
 <td>${updated}</td>
 <td>
 <button type="button" class="ghost" data-load-id="${row.id}">View</button>
 ${restoreButton}
 </td>
 </tr>
 `;
 }).join("")}
 </tbody>
 </table>
 `;

 body.querySelectorAll("[data-load-id]").forEach(button => {
 button.addEventListener("click", () => loadVersion(button.dataset.loadId));
 });
 body.querySelectorAll("[data-restore-id]").forEach(button => {
 button.addEventListener("click", () => restoreAsNewRevision(button.dataset.restoreId));
 });
 }

 function applyReadOnlyState(quotation) {
 const saveButton = document.getElementById("btnSaveQuotation");
 const createRevisionButton = document.getElementById("btnCreateRevision");
 const readOnly = !!quotation && quotation.isCurrent === false;
 const form = document.getElementById("mainForm");
 if (saveButton) {
 saveButton.disabled = readOnly;
 saveButton.title = readOnly ? "Old versions are read-only. Restore as a new revision to edit." : "";
 }
 if (createRevisionButton) {
 createRevisionButton.disabled = readOnly || !quotation;
 createRevisionButton.title = readOnly ? "Restore this old version as a new revision to edit." : "";
 }
 if (form) {
 form.querySelectorAll("input, select, textarea, button").forEach(control => {
 const isNavigationButton = control.classList.contains("service-tab") ||
 control.classList.contains("toggle-section") ||
 /^toggle/i.test(control.id || "");
 if (isNavigationButton) return;
 if (readOnly) {
 if (!control.disabled) {
 control.dataset.revisionDisabled = "1";
 control.disabled = true;
 }
 } else if (control.dataset.revisionDisabled === "1") {
 control.disabled = false;
 delete control.dataset.revisionDisabled;
 }
 });
 }
 }

 function renderRevisionPanel() {
 ensurePanel();
 const current = getCurrentQuotation();
 const badge = document.getElementById("quotationRevisionBadge");
 if (badge) {
 badge.textContent = current
 ? `Revision: ${formatRevisionLabel(current)}`
 : "Revision: save or load a quotation";
 }
 applyReadOnlyState(current);
 lastRenderedQuotationId = getCurrentId();
 }

 function init() {
 ensurePanel();
 ensureHistoryModal();
 setAllQuotations(getAllQuotations());
 initClientPaxGuard();
 renderRevisionPanel();
 document.addEventListener("click", () => window.setTimeout(renderRevisionPanel, 250), true);
 window.setInterval(() => {
 if (lastRenderedQuotationId !== getCurrentId()) {
 setClientPaxDirty(false, { captureSnapshot: true });
 renderRevisionPanel();
 }
 const current = getCurrentQuotation();
 applyReadOnlyState(current);
 updateClientPaxGuardUi();
 }, 1000);
 }

 if (document.readyState === "loading") {
 document.addEventListener("DOMContentLoaded", init);
 } else {
 init();
 }
})();
