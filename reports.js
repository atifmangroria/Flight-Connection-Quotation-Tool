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
    quotations: ["id", "type", "clientName", "destination", "status", "createdAt", "expiresAt", "amount", "agentId"],
    sales: ["id", "type", "clientName", "destination", "status", "bookedDate", "amount", "agentId"],
    customers: ["customerName", "phone", "email", "totalQuotations", "bookedQuotations", "bookedSales", "lastQuotationDate"]
};

const PRESETS = {
    sales: {
        source: "sales",
        fields: ["id", "clientName", "destination", "bookedDate", "amount", "agentId"],
        filter: ""
    },
    quotation: {
        source: "quotations",
        fields: ["id", "type", "clientName", "destination", "status", "createdAt", "amount"],
        filter: ""
    },
    destination: {
        source: "quotations",
        fields: ["destination", "totalQuotations", "bookedQuotations", "totalExpectedSales"],
        filter: "",
        groupedByDestination: true
    }
};

const dataSourceSelect = document.getElementById("data-source");
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
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const backDashboardBtn = document.getElementById("back-dashboard");

let selectedFields = [];
let activePreset = null;
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
    return (Array.isArray(list) ? list : []).map(item => ({
        id: item.id || "",
        type,
        clientName: inferClientName(item),
        destination: inferDestination(item, type),
        status: String(item.status || "pending").toLowerCase(),
        createdAt: normalizeDate(item.createdAt),
        expiresAt: normalizeDate(item.expiresAt),
        amount: inferAmount(item),
        agentId: agentId || item.agentId || "",
        phone: item?.clientData?.phone || item?.phone || "",
        email: item?.clientData?.email || item?.email || ""
    }));
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
    const source = dataSourceSelect.value;
    const fields = DATA_FIELDS[source] || [];
    fieldLibrary.innerHTML = "";

    fields.forEach(field => {
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
    }
}

function removeField(field) {
    selectedFields = selectedFields.filter(item => item !== field);
    renderSelectedFields();
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

function bindQuickRangeButtons() {
    document.querySelectorAll("[data-range]").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-range]").forEach(b => b.classList.remove("active-range"));
            button.classList.add("active-range");
            setQuickRange(button.dataset.range);
        });
    });
}

function applyFilterText(rows, filterText) {
    const text = String(filterText || "").trim();
    if (!text) return rows;

    const expressions = text
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => item.split(":").map(i => i.trim()))
        .filter(parts => parts.length === 2 && parts[0] && parts[1]);

    if (!expressions.length) return rows;

    return rows.filter(row => expressions.every(([field, expected]) => {
        const value = String(row[field] ?? "").toLowerCase();
        return value.includes(expected.toLowerCase());
    }));
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
        const source = dataSourceSelect.value;
        let rows = await getRowsBySource(source);
        rows = applyDateFilter(rows);
        rows = applyFilterText(rows, filterInput.value);

        if (activePreset === "destination") {
            rows = destinationSummary(rows);
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
    dataSourceSelect.value = preset.source;
    selectedFields = [...preset.fields];
    filterInput.value = preset.filter || "";
    updateFieldLibrary();
    renderSelectedFields();
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

    const sourceLabel = dataSourceSelect.value === "quotations"
        ? "Detailed Quotations"
        : dataSourceSelect.value === "sales"
            ? "Sales Report"
            : "Customers Report";

    const reportTitle = activePreset === "destination"
        ? "Destination Summary Report"
        : activePreset === "sales"
            ? "Sales Report"
            : activePreset === "quotation"
                ? "Quotation Report"
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
        doc.text(`Phone: ${company.phone}   |   Email: ${company.email}   |   Web: ${company.website}`, margin, 60);

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
    renderSelectedFields();
    setStatus("Select fields and click Generate.");
}

dataSourceSelect.addEventListener("change", () => {
    activePreset = null;
    selectedFields = [];
    updateFieldLibrary();
    renderSelectedFields();
    setStatus("Data source changed. Add field blocks and generate.");
});

document.querySelectorAll("[data-preset]").forEach(button => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
});

runReportBtn.addEventListener("click", runReport);
clearBuilderBtn.addEventListener("click", clearBuilder);
exportExcelBtn.addEventListener("click", exportExcel);
exportPdfBtn.addEventListener("click", exportPdf);
bindQuickRangeButtons();
initDropZone();
initDefaults();

if (backDashboardBtn) {
    backDashboardBtn.addEventListener("click", () => {
        window.location.href = "dashboard.html";
    });
}
