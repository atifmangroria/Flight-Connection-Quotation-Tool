const firebaseConfig = {
 apiKey: "AIzaSyDx3Qxt84vJlz_-mXuxiC0W2flaLadr9Ws",
 authDomain: "fc-quotation-tool.firebaseapp.com",
 projectId: "fc-quotation-tool",
 storageBucket: "fc-quotation-tool.firebasestorage.app",
 messagingSenderId: "370566945624",
 appId: "1:370566945624:web:a84b20d5a8f99d20a6e32d"
};

if (!firebase.apps.length) {
 firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const DATA_FIELDS = {
 quotations: [
 "id",
 "type",
 "clientName",
 "destination",
 "status",
 "workflowStage",
 "customerAccepted",
 "customerAcceptedAt",
 "agentApproved",
 "agentApprovedAt",
 "customerNeedsReaccept",
 "shareLinkId",
 "shareVersion",
 "lastCustomerAcceptanceAt",
 "approvedBy",
 "selfBooked",
 "createdAt",
 "expiresAt",
 "amount",
 "agentId"
 ],
 sales: ["id", "type", "clientName", "destination", "status", "bookedDate", "amount", "agentId"],
 customers: ["customerName", "phone", "email", "totalQuotations", "bookedQuotations", "bookedSales", "lastQuotationDate"]
};

const PRESETS = {
 sales: {
 source: "sales",
 fields: ["id", "clientName", "destination", "bookedDate", "amount", "agentName"],
 filter: ""
 },
 quotation: {
 source: "quotations",
 fields: ["id", "type", "clientName", "destination", "status", "workflowStage", "customerAccepted", "createdAt", "amount", "agentName"],
 filter: ""
 },
 destination: {
 source: "quotations",
 fields: ["destination", "totalQuotations", "bookedQuotations", "totalExpectedSales"],
 filter: "",
 groupedByDestination: true
 },
 bookingSummary: {
 source: "quotations",
 fields: ["id", "type", "clientName", "destination", "status", "createdAt", "amount", "agentName"],
 filter: ""
 },
 workflowFunnel: {
 source: "quotations",
 fields: ["workflowStage", "totalQuotations", "bookedQuotations", "pendingQuotations", "followupQuotations", "cancelledQuotations", "expectedSales"],
 filter: ""
 },
 agentPerformance: {
 source: "quotations",
 fields: ["agentName", "totalQuotations", "customerAcceptedCount", "agentApprovedCount", "bookedQuotations", "bookedSales", "conversionRate"],
 filter: "",
 groupedByAgent: true
 },
 customerActivity: {
 source: "customers",
 fields: ["customerName", "phone", "email", "totalQuotations", "bookedQuotations", "bookedSales", "lastQuotationDate"],
 filter: ""
 }
};

const ALL_FIELDS = Array.from(new Set([
 ...DATA_FIELDS.quotations,
 ...DATA_FIELDS.sales,
 ...DATA_FIELDS.customers,
 "agentName"
]));

const FIELD_SOURCES = {
 quotations: new Set(DATA_FIELDS.quotations.concat(["agentName"])),
 sales: new Set(DATA_FIELDS.sales.concat(["agentName"])),
 customers: new Set(DATA_FIELDS.customers)
};

function inferSourceFromFields(fields) {
 const sourceCounts = { quotations: 0, sales: 0, customers: 0 };

 fields.forEach(field => {
 if (FIELD_SOURCES.customers.has(field)) sourceCounts.customers += 1;
 if (FIELD_SOURCES.sales.has(field)) sourceCounts.sales += 1;
 if (FIELD_SOURCES.quotations.has(field)) sourceCounts.quotations += 1;
 });

 if (sourceCounts.customers > 0 && sourceCounts.customers >= sourceCounts.sales && sourceCounts.customers >= sourceCounts.quotations) {
 return "customers";
 }
 if (sourceCounts.sales > 0 && sourceCounts.sales >= sourceCounts.quotations) {
 return "sales";
 }
 return "quotations";
}

const reportSelect = document.getElementById("report-select");
const savedReportsSelect = document.getElementById("saved-reports");
const saveReportNameInput = document.getElementById("save-report-name");
const saveReportBtn = document.getElementById("save-report-btn");
const saveGlobalCheckbox = document.getElementById("save-global-checkbox");
const deleteSavedReportBtn = document.getElementById("delete-saved-report-btn");
const deleteConfirmation = document.getElementById("delete-confirmation");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");
const fieldBlockSelect = document.getElementById("field-block-select");
const addFieldBtn = document.getElementById("add-field-btn");
const fieldLibrary = document.getElementById("field-library");
const selectedFieldsZone = document.getElementById("selected-fields-zone");
const filterInput = document.getElementById("filter");
const runReportBtn = document.getElementById("run-report");
const clearBuilderBtn = document.getElementById("clear-builder");
const exportPdfBtn = document.getElementById("export-pdf");
const exportExcelBtn = document.getElementById("export-excel");
const table = document.getElementById("report-table");
const tableHead = document.getElementById("table-head");
const tableBody = document.getElementById("table-body");
const reportStatus = document.getElementById("report-status");
const reportTitleElement = document.getElementById("report-title");
const reportSubtitleElement = document.getElementById("report-subtitle");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const backDashboardBtn = document.getElementById("back-dashboard");

let selectedFields = [];
let activePreset = null;
let currentSource = "quotations";
let customReportName = null;
let savedReports = [];
let currentRenderedRows = [];
let currentRenderedFields = [];
let lastLoadUsedLocalFallback = false;
let lastLoadPermissionDenied = false;
let lastLoadAuthMissing = false;

function setStatus(message, ok = false) {
 reportStatus.textContent = message;
 reportStatus.classList.toggle("ok", ok);
}

function getDataSourceLabel() {
 return lastLoadUsedLocalFallback ? "Source: cache" : "Source: live";
}

function getActiveReportLabel() {
 if (activePreset === "destination") return "Destination Summary Report";
 if (activePreset === "sales") return "Sales Report";
 if (activePreset === "quotation") return "Quotation Report";
 if (activePreset === "bookingSummary") return "Booking Summary Report";
 if (activePreset === "workflowFunnel") return "Workflow Funnel Report";
 if (activePreset === "agentPerformance") return "Agent Performance Report";
 if (activePreset === "customerActivity") return "Customer Activity Report";
 if (activePreset === "custom" || selectedFields.length) return customReportName ? `Custom Report: ${customReportName}` : "Custom Report";
 if (currentSource === "sales") return "Sales Data Report";
 if (currentSource === "customers") return "Customers Data Report";
 return "Quotations Report";
}

function formatDateRangeLabel() {
 const from = dateFromInput.value ? new Date(dateFromInput.value).toLocaleDateString() : "-";
 const to = dateToInput.value ? new Date(dateToInput.value).toLocaleDateString() : "-";
 return `Date: ${from} - ${to}`;
}

function updateReportHeading() {
 if (!reportTitleElement || !reportSubtitleElement) return;
 const title = getActiveReportLabel();
 reportTitleElement.textContent = title;
 reportSubtitleElement.textContent = `${formatDateRangeLabel()} ${activePreset ? `Preset selected` : `Custom`}`;
}

function getLoggedInUserId() {
 const agent = getLoggedInAgent();
 return agent?.uid || agent?.id || null;
}

async function loadSavedReports() {
 savedReports = [];
 const currentUserId = getLoggedInUserId();
 let firestoreLoaded = false;

 try {
 const snapshot = await db.collection("savedReports").get();
 snapshot.forEach(doc => {
 const data = doc.data() || {};
 if (data.shared || data.ownerId === currentUserId) {
 savedReports.push({ id: doc.id, ...data });
 }
 });
 firestoreLoaded = true;
 } catch (error) {
 console.warn("Could not load saved reports from Firestore", error);
 }

 if (!firestoreLoaded) {
 const localSaved = JSON.parse(localStorage.getItem("savedReports") || "[]");
 localSaved.forEach(report => {
 if (report.shared || report.ownerId === currentUserId) {
 savedReports.push(report);
 }
 });
 }

 refreshSavedReportControls();
}

function refreshSavedReportControls() {
 if (savedReportsSelect) {
 savedReportsSelect.innerHTML = "<option value=''>-- Select saved report --</option>";
 savedReports.forEach(report => {
 const option = document.createElement("option");
 option.value = report.id;
 option.textContent = report.shared ? `${report.name} (shared)` : report.name;
 savedReportsSelect.appendChild(option);
 });
 }

 if (reportSelect) {
 const currentValue = reportSelect.value;
 const readyOptions = [
 { value: "sales", label: "Sales Report" },
 { value: "quotation", label: "Quotation Report" },
 { value: "destination", label: "By Destination" },
 { value: "bookingSummary", label: "Booking Summary" },
 { value: "workflowFunnel", label: "Workflow Funnel Report" },
 { value: "agentPerformance", label: "Agent Performance Report" },
 { value: "customerActivity", label: "Customer Activity" },
 { value: "custom", label: "Custom Report" }
 ];

 reportSelect.innerHTML = "";
 const readyGroup = document.createElement("optgroup");
 readyGroup.label = "Ready Reports";
 readyOptions.forEach(optData => {
 const option = document.createElement("option");
 option.value = optData.value;
 option.textContent = optData.label;
 readyGroup.appendChild(option);
 });
 reportSelect.appendChild(readyGroup);

 if (currentValue) reportSelect.value = currentValue;
 if (!reportSelect.value) reportSelect.value = "custom";
 }

 updateDeleteSavedReportButtonState();
}

function updateDeleteSavedReportButtonState() {
 if (!deleteSavedReportBtn || !savedReportsSelect) return;
 const selectedId = savedReportsSelect.value;
 if (!selectedId) {
 deleteSavedReportBtn.disabled = true;
 deleteSavedReportBtn.textContent = "Delete Report";
 hideDeleteConfirmation();
 return;
 }

 const report = savedReports.find(r => r.id === selectedId);
 const currentUserId = getLoggedInUserId();
 const canDelete = report && currentUserId && report.createdBy === currentUserId;

 deleteSavedReportBtn.disabled = !canDelete;
 deleteSavedReportBtn.textContent = canDelete ? "Delete Report" : "Delete Not Allowed";
}

function showDeleteConfirmation() {
 if (deleteConfirmation) deleteConfirmation.style.display = "block";
}

function hideDeleteConfirmation() {
 if (deleteConfirmation) deleteConfirmation.style.display = "none";
}

async function deleteSavedReport(reportId) {
 hideDeleteConfirmation();
 const report = savedReports.find(r => r.id === reportId);
 if (!report) {
 setStatus("Saved report not found.");
 return;
 }

 const currentUserId = getLoggedInUserId();
 if (!currentUserId || report.createdBy !== currentUserId) {
 setStatus("You can only delete reports you created.");
 updateDeleteSavedReportButtonState();
 return;
 }

 let deleted = false;
 try {
 await db.collection("savedReports").doc(reportId).delete();
 deleted = true;
 setStatus(`Deleted saved report '${report.name}'.`, true);
 } catch (error) {
 console.warn("Firestore delete failed, falling back to local storage", error);
 }

 const localSaved = JSON.parse(localStorage.getItem("savedReports") || "[]");
 const filtered = localSaved.filter(item => item.id !== reportId);
 if (filtered.length !== localSaved.length) {
 localStorage.setItem("savedReports", JSON.stringify(filtered));
 deleted = true;
 }

 if (!deleted) {
 setStatus("Could not delete saved report.");
 return;
 }

 await loadSavedReports();
 if (savedReportsSelect) savedReportsSelect.value = "";
 updateDeleteSavedReportButtonState();
}

async function saveCustomReport() {
 const name = saveReportNameInput.value.trim();
 if (!name) {
 setStatus("Enter a name to save the report.");
 return;
 }

 const currentUserId = getLoggedInUserId();
 if (!currentUserId) {
 setStatus("Login required to save custom reports.");
 return;
 }

 const isGlobal = saveGlobalCheckbox.checked && String(getLoggedInAgent()?.role || "").toLowerCase() === "admin";
 const payload = {
 name,
 source: currentSource,
 fields: [...selectedFields],
 filter: filterInput.value || "",
 fromDate: dateFromInput.value || null,
 toDate: dateToInput.value || null,
 shared: isGlobal,
 ownerId: isGlobal ? null : currentUserId,
 createdBy: currentUserId,
 createdAt: new Date().toISOString()
 };

 try {
 const savedReportRef = await db.collection("savedReports").add(payload);
 setStatus(`Report '${name}' saved successfully.`, true);
 saveReportNameInput.value = "";
 customReportName = name;
 activePreset = "custom";
 currentSource = payload.source || "quotations";
 if (reportSelect) reportSelect.value = "custom";
 updateReportHeading();
 await loadSavedReports();
 if (reportSelect) reportSelect.value = savedReportRef.id;
 return;
 } catch (error) {
 console.error(error);
 setStatus(`Firestore save failed, using local fallback.`);
 }

 const localSaved = JSON.parse(localStorage.getItem("savedReports") || "[]");
 const localId = `local-${Date.now()}`;
 const localPayload = { id: localId, ...payload };
 localSaved.push(localPayload);
 localStorage.setItem("savedReports", JSON.stringify(localSaved));
 setStatus(`Report '${name}' saved locally.`, true);
 saveReportNameInput.value = "";
 customReportName = name;
 activePreset = "custom";
 currentSource = payload.source || "quotations";
 if (reportSelect) reportSelect.value = "custom";
 updateReportHeading();
 loadSavedReports();
}

function applySavedReport(reportId) {
 const report = savedReports.find(r => r.id === reportId);
 if (!report) return;

 activePreset = "custom";
 customReportName = report.name;
 currentSource = report.source || "quotations";
 selectedFields = Array.isArray(report.fields) ? [...report.fields] : [];
 filterInput.value = report.filter || "";
 if (report.fromDate) dateFromInput.value = report.fromDate;
 if (report.toDate) dateToInput.value = report.toDate;
 if (reportSelect) reportSelect.value = report.id;
 updateFieldLibrary();
 renderSelectedFields();
 updateReportHeading();
 setStatus(`Loaded saved report '${report.name}'. Click Generate.`);
}

function formatDateRangeLabel() {
 const from = dateFromInput.value ? new Date(dateFromInput.value).toLocaleDateString() : "-";
 const to = dateToInput.value ? new Date(dateToInput.value).toLocaleDateString() : "-";
 return `Date: ${from} - ${to}`;
}

function normalizeDate(value) {
 if (!value) return null;
 if (value.toDate) return value.toDate();
 const d = new Date(value);
 return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
 const d = normalizeDate(value);
 return d ? d.toLocaleDateString() : "";
}

function normalizeMoney(value) {
 const n = Number(value);
 return Number.isFinite(n) ? n : 0;
}

function inferAmount(quotation) {
 return normalizeMoney(
 quotation?.amount
 ?? quotation?.totalAmount
 ?? quotation?.grandTotal
 ?? quotation?.totalPrice
 ?? quotation?.price
 ?? quotation?.packagePrice
 ?? 0
 );
}

function inferDestination(quotation, type = "") {
 const qType = String(type || quotation?.type || "").toLowerCase();
 if (qType === "umrah") {
 return "Umrah";
 }

 return quotation?.clientData?.tourDestination
 || quotation?.tourDestination
 || quotation?.clientData?.destination
 || quotation?.destination
 || quotation?.route
 || quotation?.to
 || quotation?.travelTo
 || quotation?.destinationCity
 || "N/A";
}

function inferClientName(quotation) {
 return quotation?.clientName
 || quotation?.clientData?.name
 || quotation?.customerName
 || quotation?.name
 || "N/A";
}

function extractEventTimestamp(eventObject) {
 if (!eventObject) return null;
 return eventObject.acceptedAt || eventObject.approvedAt || eventObject.createdAt || eventObject.updatedAt || null;
}

function getWorkflowStage(quotation) {
 const status = String(quotation?.status || "pending").toLowerCase();
 const customerAccepted = !!quotation?.customerAcceptance;
 const agentApproved = !!quotation?.agentApproval;
 const needsReaccept = !!quotation?.customerNeedsReaccept;
 if (status === "booked") return "Booked";
 if (needsReaccept) return "Needs Re-Accept";
 if (customerAccepted && !agentApproved) return "Awaiting Agent Approval";
 if (quotation?.shareLinkId && !customerAccepted) return "Awaiting Customer Acceptance";
 return status.charAt(0).toUpperCase() + status.slice(1);
}

function workflowFunnelSummary(quotations) {
 const stageMap = new Map();
 quotations.forEach(q => {
 const stage = getWorkflowStage(q);
 const row = stageMap.get(stage) || {
 workflowStage: stage,
 totalQuotations: 0,
 bookedQuotations: 0,
 pendingQuotations: 0,
 followupQuotations: 0,
 cancelledQuotations: 0,
 expectedSales: 0
 };
 row.totalQuotations += 1;
 row.expectedSales += normalizeMoney(q.amount);
 if (q.status === "booked") row.bookedQuotations += 1;
 if (q.status === "pending") row.pendingQuotations += 1;
 if (q.status === "followup") row.followupQuotations += 1;
 if (q.status === "cancelled") row.cancelledQuotations += 1;
 stageMap.set(stage, row);
 });
 return Array.from(stageMap.values()).sort((a, b) => b.totalQuotations - a.totalQuotations);
}

function agentPerformanceSummary(quotations) {
 const grouped = new Map();
 quotations.forEach(q => {
 const agentName = q.agentName || q.agentId || "Unknown";
 const row = grouped.get(agentName) || {
 agentName,
 totalQuotations: 0,
 customerAcceptedCount: 0,
 agentApprovedCount: 0,
 bookedQuotations: 0,
 bookedSales: 0,
 conversionRate: 0
 };
 row.totalQuotations += 1;
 if (q.customerAccepted) row.customerAcceptedCount += 1;
 if (q.agentApproved) row.agentApprovedCount += 1;
 if (q.status === "booked") {
 row.bookedQuotations += 1;
 row.bookedSales += normalizeMoney(q.amount);
 }
 grouped.set(agentName, row);
 });
 const rows = Array.from(grouped.values());
 rows.forEach(row => {
 row.conversionRate = row.totalQuotations > 0 ? `${Math.round((row.bookedQuotations / row.totalQuotations) * 100)}%` : "0%";
 });
 return rows.sort((a, b) => b.bookedQuotations - a.bookedQuotations);
}

function getLoggedInAgent() {
 try {
 return JSON.parse(localStorage.getItem("loggedInAgent")) || null;
 } catch {
 return null;
 }
}

function getOwnerId(agent) {
 return agent?.uid || agent?.id || firebase.auth?.()?.currentUser?.uid || null;
}

function isPermissionDeniedError(error) {
 return error?.code === "permission-denied"
 || String(error?.message || "").toLowerCase().includes("insufficient permissions");
}

function waitForAuthSession(timeoutMs = 4000) {
 return new Promise(resolve => {
 if (!firebase.auth) {
 resolve(null);
 return;
 }

 const auth = firebase.auth();
 if (auth.currentUser) {
 resolve(auth.currentUser);
 return;
 }

 let done = false;
 const finish = (user) => {
 if (done) return;
 done = true;
 clearTimeout(timer);
 unsubscribe();
 resolve(user || null);
 };

 const timer = setTimeout(() => finish(auth.currentUser), timeoutMs);
 const unsubscribe = auth.onAuthStateChanged(user => finish(user), () => finish(null));
 });
}

function getLocalQuotationsSnapshot() {
 return {
 umrah: JSON.parse(localStorage.getItem("savedQuotations") || "[]"),
 international: JSON.parse(localStorage.getItem("savedQuotations_international") || "[]"),
 domestic: JSON.parse(localStorage.getItem("savedQuotations_domestic") || "[]")
 };
}

function normalizeQuotationList(list, type, agentId) {
 return (Array.isArray(list) ? list : []).map(item => {
 const customerAccepted = !!item.customerAcceptance;
 const agentApproved = !!item.agentApproval;
 const customerAcceptedAt = extractEventTimestamp(item.customerAcceptance);
 const agentApprovedAt = extractEventTimestamp(item.agentApproval);
 const lastCustomerAcceptanceAt = extractEventTimestamp(item.lastCustomerAcceptance);
 const agentName = item.agentData?.name || item.agentName || "";
 const workflowStage = getWorkflowStage(item);

 return {
 id: item.id || "",
 type,
 clientName: inferClientName(item),
 destination: inferDestination(item, type),
 status: String(item.status || "pending").toLowerCase(),
 workflowStage,
 customerAccepted,
 customerAcceptedAt: customerAcceptedAt ? normalizeDate(customerAcceptedAt) : null,
 agentApproved,
 agentApprovedAt: agentApprovedAt ? normalizeDate(agentApprovedAt) : null,
 customerNeedsReaccept: !!item.customerNeedsReaccept,
 shareLinkId: item.shareLinkId || "",
 shareVersion: item.shareVersion || 0,
 lastCustomerAcceptanceAt: lastCustomerAcceptanceAt ? normalizeDate(lastCustomerAcceptanceAt) : null,
 approvedBy: item.agentApproval?.approvedBy || item.approvedBy || "",
 selfBooked: !!item.agentApproval?.selfBooked || !!item.selfBooked,
 createdAt: normalizeDate(item.createdAt),
 expiresAt: normalizeDate(item.expiresAt),
 amount: inferAmount(item),
 agentId: agentId || item.agentId || "",
 agentName,
 phone: item?.clientData?.phone || item?.phone || "",
 email: item?.clientData?.email || item?.email || ""
 };
 });
}

async function loadQuotationRecords() {
 const map = [
 { collection: "umrah_quotations", type: "umrah" },
 { collection: "international_quotations", type: "international" },
 { collection: "domestic_quotations", type: "domestic" }
 ];
 const agent = getLoggedInAgent();
 const ownerId = getOwnerId(agent);
 const isAdminSession = String(agent?.role || "").toLowerCase() === "admin";
 const all = [];

 lastLoadUsedLocalFallback = false;
 lastLoadPermissionDenied = false;
 lastLoadAuthMissing = false;

 const authUser = firebase.auth ? firebase.auth().currentUser : null;
 if (!authUser) {
 lastLoadAuthMissing = true;
 }

 if (isAdminSession) {
 for (const source of map) {
 try {
 const snapshot = await db.collection(source.collection).get();
 snapshot.forEach(doc => {
 const payload = doc.data() || {};
 all.push(...normalizeQuotationList(payload.quotations, source.type, doc.id));
 });
 } catch (error) {
 if (isPermissionDeniedError(error)) {
 lastLoadPermissionDenied = true;
 break;
 }
 throw error;
 }
 }
 } else if (ownerId) {
 for (const source of map) {
 try {
 const docSnap = await db.collection(source.collection).doc(ownerId).get();
 if (!docSnap.exists) continue;
 const payload = docSnap.data() || {};
 all.push(...normalizeQuotationList(payload.quotations, source.type, ownerId));
 } catch (error) {
 if (isPermissionDeniedError(error)) {
 lastLoadPermissionDenied = true;
 break;
 }
 throw error;
 }
 }
 }

 if (all.length > 0) {
 return all;
 }

 const local = getLocalQuotationsSnapshot();
 lastLoadUsedLocalFallback = true;

 all.push(...normalizeQuotationList(local.umrah, "umrah", ownerId));
 all.push(...normalizeQuotationList(local.international, "international", ownerId));
 all.push(...normalizeQuotationList(local.domestic, "domestic", ownerId));

 return all;
}

function deriveSales(quotations) {
 return quotations
 .filter(q => q.status === "booked")
 .map(q => ({
 id: q.id,
 type: q.type,
 clientName: q.clientName,
 destination: q.destination,
 status: q.status,
 bookedDate: q.createdAt,
 amount: q.amount,
 agentId: q.agentId
 }));
}

function deriveCustomers(quotations) {
 const grouped = new Map();
 quotations.forEach(q => {
 const key = `${String(q.clientName || "").trim().toLowerCase()}|${String(q.phone || "").trim()}`;
 if (!grouped.has(key)) {
 grouped.set(key, {
 customerName: q.clientName,
 phone: q.phone,
 email: q.email,
 totalQuotations: 0,
 bookedQuotations: 0,
 bookedSales: 0,
 lastQuotationDate: q.createdAt
 });
 }
 const row = grouped.get(key);
 row.totalQuotations += 1;
 if (q.status === "booked") {
 row.bookedQuotations += 1;
 row.bookedSales += normalizeMoney(q.amount);
 }
 if (normalizeDate(q.createdAt) > normalizeDate(row.lastQuotationDate)) {
 row.lastQuotationDate = q.createdAt;
 }
 });
 return Array.from(grouped.values());
}

function destinationSummary(quotations) {
 const grouped = new Map();
 quotations.forEach(q => {
 const key = q.destination || "N/A";
 if (!grouped.has(key)) {
 grouped.set(key, {
 destination: key,
 totalQuotations: 0,
 bookedQuotations: 0,
 totalExpectedSales: 0
 });
 }
 const row = grouped.get(key);
 row.totalQuotations += 1;
 row.totalExpectedSales += normalizeMoney(q.amount);
 if (q.status === "booked") {
 row.bookedQuotations += 1;
 }
 });
 return Array.from(grouped.values()).sort((a, b) => b.totalQuotations - a.totalQuotations);
}

function updateFieldLibrary() {
 fieldLibrary.innerHTML = "";
 fieldBlockSelect.innerHTML = "<option value=''>Select field to add</option>";
 ALL_FIELDS.forEach(field => {
 const option = document.createElement("option");
 option.value = field;
 option.textContent = field;
 fieldBlockSelect.appendChild(option);

 const chip = document.createElement("button");
 chip.className = "field-chip";
 chip.type = "button";
 chip.draggable = true;
 chip.dataset.field = field;
 chip.textContent = field;
 chip.addEventListener("click", () => addField(field));
 chip.addEventListener("dragstart", (event) => {
 event.dataTransfer.setData("text/plain", field);
 });
 fieldLibrary.appendChild(chip);
 });
}

function renderSelectedFields() {
 selectedFieldsZone.innerHTML = "";
 if (!selectedFields.length) {
 const hint = document.createElement("div");
 hint.className = "drop-hint";
 hint.textContent = "Drag field blocks here (or click blocks to add).";
 selectedFieldsZone.appendChild(hint);
 return;
 }

 selectedFields.forEach(field => {
 const chip = document.createElement("span");
 chip.className = "selected-chip";
 chip.innerHTML = `${field} <button class="remove-chip" data-field="${field}" type="button">x</button>`;
 selectedFieldsZone.appendChild(chip);
 });

 selectedFieldsZone.querySelectorAll(".remove-chip").forEach(button => {
 button.addEventListener("click", () => removeField(button.dataset.field));
 });
}

function addField(field) {
 if (!selectedFields.includes(field)) {
 selectedFields.push(field);
 renderSelectedFields();
 updateReportHeading();
 }
}

function removeField(field) {
 selectedFields = selectedFields.filter(item => item !== field);
 renderSelectedFields();
 updateReportHeading();
}

function setQuickRange(type) {
 const now = new Date();
 const start = new Date(now);
 const end = new Date(now);

 if (type === "last-week") {
 start.setDate(now.getDate() - 7);
 } else if (type === "last-month") {
 start.setMonth(now.getMonth() - 1);
 } else if (type === "this-month") {
 start.setDate(1);
 } else if (type === "last-3-months") {
 start.setMonth(now.getMonth() - 3);
 } else if (type === "custom") {
 return;
 }

 dateFromInput.value = start.toISOString().slice(0, 10);
 dateToInput.value = end.toISOString().slice(0, 10);
}

function debounce(fn, delay = 250) {
 let timeoutId;
 return (...args) => {
 clearTimeout(timeoutId);
 timeoutId = setTimeout(() => fn(...args), delay);
 };
}

function bindQuickRangeButtons() {
 document.querySelectorAll("[data-range]").forEach(button => {
 button.addEventListener("click", () => {
 document.querySelectorAll("[data-range]").forEach(b => b.classList.remove("active-range"));
 button.classList.add("active-range");
 setQuickRange(button.dataset.range);
 updateReportHeading();
 });
 });
}

function applyFilterText(rows, filterText) {
 const text = String(filterText || "").trim();
 if (!text) return rows;

 const normalizedRowKeys = rows.length ? Object.keys(rows[0]).map(k => k.toLowerCase()) : [];

 const expressions = text
 .split(",")
 .map(item => item.trim())
 .filter(Boolean)
 .map(item => {
 const parts = item.split(/[:=]/).map(i => i.trim());
 if (parts.length === 2 && parts[0] && parts[1]) {
 return { field: parts[0], value: parts[1] };
 }
 return { field: null, value: item };
 });

 return rows.filter(row => {
 return expressions.every(expression => {
 if (expression.field) {
 const fieldName = normalizedRowKeys.find(key => key === expression.field.toLowerCase());
 if (!fieldName) {
 return Object.keys(row).some(key => key.toLowerCase() === expression.field.toLowerCase() && String(row[key] ?? "").toLowerCase().includes(expression.value.toLowerCase()));
 }
 const origKey = Object.keys(row).find(key => key.toLowerCase() === fieldName);
 const value = String(row[origKey] ?? "").toLowerCase();
 return value.includes(expression.value.toLowerCase());
 }

 const search = expression.value.toLowerCase();
 return Object.values(row).some(value => String(value ?? "").toLowerCase().includes(search));
 });
 });
}

function applyDateFilter(rows) {
 const from = dateFromInput.value ? new Date(dateFromInput.value) : null;
 const to = dateToInput.value ? new Date(dateToInput.value) : null;

 if (!from && !to) return rows;

 return rows.filter(row => {
 const ref = normalizeDate(row.createdAt || row.bookedDate || row.lastQuotationDate);
 if (!ref) return false;
 if (from && ref < from) return false;
 if (to) {
 const end = new Date(to);
 end.setHours(23, 59, 59, 999);
 if (ref > end) return false;
 }
 return true;
 });
}

function serializeValue(value) {
 if (value === null || value === undefined) return "";
 if (value instanceof Date || (value && value.toDate)) return formatDate(value);
 if (typeof value === "number") return String(Math.round(value * 100) / 100);
 return String(value);
}

function renderTable(fields, rows) {
 tableHead.innerHTML = "";
 tableBody.innerHTML = "";
 if (!rows.length || !fields.length) {
 table.style.display = "none";
 exportPdfBtn.disabled = true;
 exportExcelBtn.disabled = true;
 return;
 }

 fields.forEach(field => {
 const th = document.createElement("th");
 th.textContent = field;
 tableHead.appendChild(th);
 });

 rows.forEach(row => {
 const tr = document.createElement("tr");
 fields.forEach(field => {
 const td = document.createElement("td");
 td.textContent = serializeValue(row[field]);
 tr.appendChild(td);
 });
 tableBody.appendChild(tr);
 });

 table.style.display = "table";
 exportPdfBtn.disabled = false;
 exportExcelBtn.disabled = false;
}

async function getRowsBySource(source) {
 const quotations = await loadQuotationRecords();
 if (source === "quotations") return quotations;
 if (source === "sales") return deriveSales(quotations);
 if (source === "customers") return deriveCustomers(quotations);
 return [];
}

async function runReport() {
 if (!selectedFields.length) {
 setStatus("Please add at least one field block before generating.");
 return;
 }

 try {
 setStatus("Loading data from Firebase...");
 await waitForAuthSession();
 if (activePreset === "custom") {
 currentSource = inferSourceFromFields(selectedFields);
 }
 let rows = await getRowsBySource(currentSource);
 rows = applyDateFilter(rows);
 rows = applyFilterText(rows, filterInput.value);

 if (activePreset === "destination") {
 rows = destinationSummary(rows);
 } else if (activePreset === "workflowFunnel") {
 rows = workflowFunnelSummary(rows);
 } else if (activePreset === "agentPerformance") {
 rows = agentPerformanceSummary(rows);
 }

 const validFields = selectedFields.filter(field => rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], field));
 currentRenderedRows = rows;
 currentRenderedFields = validFields;

 renderTable(validFields, rows);
 if (!rows.length) {
 if (lastLoadAuthMissing) {
 setStatus("No Firebase session found on this page. Please open Reports from dashboard after login.");
 return;
 }
 if (lastLoadPermissionDenied) {
 setStatus(`No rows found for selected filters and date range. ${getDataSourceLabel()}`);
 return;
 }
 setStatus(`No rows found for selected filters and date range. ${getDataSourceLabel()}`);
 } else if (lastLoadUsedLocalFallback && lastLoadPermissionDenied) {
 setStatus(`Generated ${rows.length} row(s). ${getDataSourceLabel()}`, true);
 } else {
 setStatus(`Generated ${rows.length} row(s). ${getDataSourceLabel()}`, true);
 }
 } catch (error) {
 console.error(error);
 setStatus(`Could not generate report: ${error.message || error}`);
 }
}

function applyPreset(name) {
 const preset = PRESETS[name];
 if (!preset) return;

 activePreset = name;
 currentSource = preset.source;
 customReportName = name === "custom" ? customReportName : null;
 selectedFields = [...preset.fields];
 filterInput.value = preset.filter || "";
 updateFieldLibrary();
 renderSelectedFields();
 updateReportHeading();
 setStatus(`${name.replace("-", " ")} preset selected. Click Generate.`);
}

function clearBuilder() {
 selectedFields = [];
 activePreset = null;
 filterInput.value = "";
 renderSelectedFields();
 table.style.display = "none";
 tableHead.innerHTML = "";
 tableBody.innerHTML = "";
 exportPdfBtn.disabled = true;
 exportExcelBtn.disabled = true;
 currentRenderedRows = [];
 currentRenderedFields = [];
 updateReportHeading();
 setStatus("Builder reset. Select fields and click Generate.");
}

function exportExcel() {
 const rows = currentRenderedRows;
 const fields = currentRenderedFields;
 if (!rows.length || !fields.length) return;

 const wsData = [fields, ...rows.map(row => fields.map(field => serializeValue(row[field])))];
 const ws = XLSX.utils.aoa_to_sheet(wsData);
 const wb = XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb, ws, "Report");
 XLSX.writeFile(wb, "custom-report.xlsx");
}

function exportPdf() {
 const rows = currentRenderedRows;
 const fields = currentRenderedFields;
 if (!rows.length || !fields.length) return;

 const { jsPDF } = window.jspdf;
 const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
 const pageWidth = doc.internal.pageSize.getWidth();
 const pageHeight = doc.internal.pageSize.getHeight();
 const margin = 36;
 const now = new Date();
 const agent = getLoggedInAgent() || {};

 const company = {
 name: "Flight Connection Travel and Tours",
 address: "Mezzanine Floor, 17-E, Shahbaz Commercial, Phase 6 DHA, Karachi",
 phone: "+92 21 111 000 321",
 email: "muhammad.atif@flightconnection.net.pk",
 website: "www.flightconnection.net.pk"
 };

 const sourceLabel = currentSource === "quotations"
 ? "Detailed Quotations"
 : currentSource === "sales"
 ? "Sales Report"
 : "Customers Report";

 const reportTitle = activePreset === "destination"
 ? "Destination Summary Report"
 : activePreset === "sales"
 ? "Sales Report"
 : activePreset === "quotation"
 ? "Quotation Report"
 : activePreset === "bookingSummary"
 ? "Booking Summary Report"
 : activePreset === "customerActivity"
 ? "Customer Activity Report"
 : activePreset === "custom"
 ? customReportName || "Custom Report"
 : sourceLabel;

 const reportId = `RPT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
 const fromText = dateFromInput.value || "-";
 const toText = dateToInput.value || "-";

 const quotationRows = rows.filter(r => Object.prototype.hasOwnProperty.call(r, "status"));
 const summary = {
 total: rows.length,
 booked: quotationRows.filter(r => String(r.status || "").toLowerCase() === "booked").length,
 pending: quotationRows.filter(r => String(r.status || "").toLowerCase() === "pending").length,
 followup: quotationRows.filter(r => String(r.status || "").toLowerCase() === "followup").length,
 cancelled: quotationRows.filter(r => String(r.status || "").toLowerCase() === "cancelled").length,
 expectedSales: rows.reduce((sum, r) => sum + normalizeMoney(r.amount), 0)
 };

 const drawHeader = () => {
 doc.setFillColor(11, 118, 209);
 doc.rect(0, 0, pageWidth, 82, "F");

 doc.setTextColor(255, 255, 255);
 doc.setFontSize(16);
 doc.setFont(undefined, "bold");
 doc.text(company.name, margin, 30);
 doc.setFontSize(9);
 doc.setFont(undefined, "normal");
 doc.text(company.address, margin, 46);
 doc.text(`Phone: ${company.phone} | Email: ${company.email} | Web: ${company.website}`, margin, 60);

 doc.setFont(undefined, "bold");
 doc.setFontSize(15);
 doc.text(reportTitle, pageWidth - margin, 30, { align: "right" });
 doc.setFont(undefined, "normal");
 doc.setFontSize(9);
 doc.text(`Report ID: ${reportId}`, pageWidth - margin, 46, { align: "right" });
 doc.text(`Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, pageWidth - margin, 60, { align: "right" });

 doc.setTextColor(35, 35, 35);
 };

 const drawFooter = (pageNumber, totalPages) => {
 doc.setDrawColor(210, 220, 235);
 doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
 doc.setFontSize(8.5);
 doc.setTextColor(90, 90, 90);
 doc.text(`Prepared by: ${agent.name || "N/A"} | Phone: ${agent.phone || "N/A"}`, margin, pageHeight - 17);
 doc.text(`Printed on: ${now.toLocaleDateString()} ${now.toLocaleTimeString()} | Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 17, { align: "right" });
 doc.setTextColor(35, 35, 35);
 };

 drawHeader();

 doc.setFontSize(10);
 doc.setFont(undefined, "bold");
 doc.text("Report Metadata", margin, 102);
 doc.setFont(undefined, "normal");
 doc.setFontSize(9);
 doc.text(`Generated By: ${agent.name || "N/A"}`, margin, 118);
 doc.text(`User Role: ${agent.role || "N/A"}`, margin + 180, 118);
 doc.text(`Date Range: ${fromText} to ${toText}`, margin + 320, 118);
 doc.text(`Data Source: ${sourceLabel}`, margin + 560, 118);

 const cards = [
 { label: "Total Rows", value: String(summary.total) },
 { label: "Booked", value: String(summary.booked) },
 { label: "Pending", value: String(summary.pending) },
 { label: "Follow-up", value: String(summary.followup) },
 { label: "Cancelled", value: String(summary.cancelled) },
 { label: "Expected Sales", value: `PKR ${Math.round(summary.expectedSales).toLocaleString("en-PK")}` }
 ];

 const cardY = 132;
 const gap = 8;
 const cardW = (pageWidth - (margin * 2) - (gap * (cards.length - 1))) / cards.length;
 const cardH = 44;
 cards.forEach((card, i) => {
 const x = margin + i * (cardW + gap);
 doc.setDrawColor(203, 219, 241);
 doc.setFillColor(247, 251, 255);
 doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
 doc.setFontSize(8);
 doc.setTextColor(90, 100, 120);
 doc.text(card.label, x + 8, cardY + 14);
 doc.setFontSize(10);
 doc.setFont(undefined, "bold");
 doc.setTextColor(24, 37, 59);
 doc.text(card.value, x + 8, cardY + 31);
 doc.setFont(undefined, "normal");
 });

 const headers = ["Sr", ...fields.map(f => String(f || "").replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()))];
 const bodyRows = rows.map((row, index) => [
 index + 1,
 ...fields.map(field => serializeValue(row[field]))
 ]);

 if (typeof doc.autoTable === "function") {
 doc.autoTable({
 startY: cardY + cardH + 16,
 head: [headers],
 body: bodyRows,
 theme: "grid",
 styles: {
 fontSize: 8,
 cellPadding: 5,
 lineColor: [220, 228, 240],
 lineWidth: 0.6,
 textColor: [32, 42, 61]
 },
 headStyles: {
 fillColor: [11, 118, 209],
 textColor: [255, 255, 255],
 fontStyle: "bold"
 },
 alternateRowStyles: {
 fillColor: [248, 251, 255]
 },
 margin: { left: margin, right: margin, top: 92, bottom: 38 },
 didDrawPage: (data) => {
 if (data.pageNumber > 1) {
 doc.setFillColor(11, 118, 209);
 doc.rect(0, 0, pageWidth, 36, "F");
 doc.setTextColor(255, 255, 255);
 doc.setFontSize(11);
 doc.setFont(undefined, "bold");
 doc.text(`${reportTitle} | ${reportId}`, margin, 23);
 doc.setFont(undefined, "normal");
 doc.setTextColor(35, 35, 35);
 }
 }
 });
 } else {
 // Fallback if autoTable plugin is unavailable.
 doc.setFontSize(9);
 let y = cardY + cardH + 16;
 doc.text(headers.join(" | "), margin, y);
 y += 12;
 bodyRows.slice(0, 28).forEach(row => {
 doc.text(row.join(" | ").slice(0, 200), margin, y);
 y += 11;
 });
 }

 const totalPages = doc.getNumberOfPages();
 for (let i = 1; i <= totalPages; i++) {
 doc.setPage(i);
 drawFooter(i, totalPages);
 }

 doc.save(`professional-report-${reportId}.pdf`);
}

function initDropZone() {
 selectedFieldsZone.addEventListener("dragover", (event) => {
 event.preventDefault();
 selectedFieldsZone.classList.add("drag-over");
 });
 selectedFieldsZone.addEventListener("dragleave", () => {
 selectedFieldsZone.classList.remove("drag-over");
 });
 selectedFieldsZone.addEventListener("drop", (event) => {
 event.preventDefault();
 selectedFieldsZone.classList.remove("drag-over");
 const field = event.dataTransfer.getData("text/plain");
 if (field) addField(field);
 });
}

function initDefaults() {
 const now = new Date();
 const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
 dateFromInput.value = monthStart.toISOString().slice(0, 10);
 dateToInput.value = now.toISOString().slice(0, 10);

 updateFieldLibrary();
 selectedFields = ["id", "clientName", "destination", "status", "createdAt", "amount"];
 currentSource = "quotations";
 activePreset = "quotation";
 if (reportSelect) reportSelect.value = "quotation";
 renderSelectedFields();
 updateReportHeading();
 setStatus("Select fields and click Generate.");
 loadSavedReports();
}

if (reportSelect) {
 reportSelect.addEventListener("change", (event) => {
 const selected = event.target.value;
 if (selected === "custom") {
 activePreset = "custom";
 customReportName = null;
 selectedFields = [];
 currentSource = "quotations";
 filterInput.value = "";
 updateFieldLibrary();
 renderSelectedFields();
 updateReportHeading();
 setStatus("Custom report selected. Choose fields and click Generate.");
 return;
 }
 applyPreset(selected);
 });
}

if (savedReportsSelect) {
 savedReportsSelect.addEventListener("change", (event) => {
 const reportId = event.target.value;
 if (reportId) applySavedReport(reportId);
 updateDeleteSavedReportButtonState();
 });
}

if (deleteSavedReportBtn) {
 deleteSavedReportBtn.addEventListener("click", () => {
 if (!savedReportsSelect?.value) return;
 showDeleteConfirmation();
 });
}

if (confirmDeleteBtn) {
 confirmDeleteBtn.addEventListener("click", async () => {
 const reportId = savedReportsSelect?.value;
 if (!reportId) return;
 await deleteSavedReport(reportId);
 });
}

if (cancelDeleteBtn) {
 cancelDeleteBtn.addEventListener("click", () => {
 hideDeleteConfirmation();
 });
}

if (addFieldBtn) {
 addFieldBtn.addEventListener("click", () => {
 const field = fieldBlockSelect.value;
 if (field) addField(field);
 });
}

if (saveReportBtn) {
 saveReportBtn.addEventListener("click", saveCustomReport);
}

runReportBtn.addEventListener("click", runReport);
clearBuilderBtn.addEventListener("click", clearBuilder);
exportExcelBtn.addEventListener("click", exportExcel);
exportPdfBtn.addEventListener("click", exportPdf);

 if (filterInput) {
 const instantFilter = debounce(() => {
 if (!currentRenderedRows.length) return;
 const rows = applyFilterText(currentRenderedRows, filterInput.value);
 const validFields = currentRenderedFields.filter(field => rows.length === 0 || Object.prototype.hasOwnProperty.call(rows[0], field));
 renderTable(validFields, rows);
 setStatus(`Filtered ${rows.length} row(s). ${getDataSourceLabel()}`, true);
 }, 250);
 filterInput.addEventListener("input", instantFilter);
 }

if (backDashboardBtn) {
 backDashboardBtn.addEventListener("click", () => {
 window.location.href = "dashboard.html";
 });
}
bindQuickRangeButtons();
initDefaults();