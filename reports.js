// reports.js
// Firebase config placeholder - replace with your actual config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const dataSourceSelect = document.getElementById('data-source');
const fieldsSelect = document.getElementById('fields');
const runReportBtn = document.getElementById('run-report');
const exportPdfBtn = document.getElementById('export-pdf');
const exportExcelBtn = document.getElementById('export-excel');
const table = document.getElementById('report-table');
const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');

let currentData = [];
let currentFields = [];

// Example fields for each data source
const DATA_FIELDS = {
    quotations: ['id', 'customer', 'amount', 'status', 'createdAt'],
    customers: ['id', 'name', 'email', 'phone', 'createdAt'],
    sales: ['id', 'product', 'quantity', 'total', 'date']
};

function populateFields() {
    const source = dataSourceSelect.value;
    fieldsSelect.innerHTML = '';
    DATA_FIELDS[source].forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        option.selected = true;
        fieldsSelect.appendChild(option);
    });
    fieldsSelect.size = DATA_FIELDS[source].length;
}

dataSourceSelect.addEventListener('change', populateFields);
populateFields();

runReportBtn.addEventListener('click', async () => {
    const source = dataSourceSelect.value;
    const selectedFields = Array.from(fieldsSelect.selectedOptions).map(opt => opt.value);
    const filter = document.getElementById('filter').value.trim();
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    let query = db.collection(source);
    // Simple filter parser: e.g. status:approved
    if (filter) {
        const [field, value] = filter.split(':');
        if (field && value) query = query.where(field, '==', value);
    }
    if (dateFrom) query = query.where('createdAt', '>=', new Date(dateFrom));
    if (dateTo) query = query.where('createdAt', '<=', new Date(dateTo));

    const snapshot = await query.get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    currentData = data;
    currentFields = selectedFields;
    renderTable(selectedFields, data);
    exportPdfBtn.disabled = data.length === 0;
    exportExcelBtn.disabled = data.length === 0;
});

function renderTable(fields, data) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    if (data.length === 0) {
        table.style.display = 'none';
        return;
    }
    fields.forEach(field => {
        const th = document.createElement('th');
        th.textContent = field;
        tableHead.appendChild(th);
    });
    data.forEach(row => {
        const tr = document.createElement('tr');
        fields.forEach(field => {
            const td = document.createElement('td');
            td.textContent = row[field] !== undefined ? row[field] : '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });
    table.style.display = '';
}

exportPdfBtn.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let y = 10;
    doc.text('Custom Report', 10, y);
    y += 10;
    // Header
    currentFields.forEach((field, i) => {
        doc.text(field, 10 + i * 40, y);
    });
    y += 10;
    // Rows
    currentData.forEach(row => {
        currentFields.forEach((field, i) => {
            doc.text(String(row[field] ?? ''), 10 + i * 40, y);
        });
        y += 10;
    });
    doc.save('report.pdf');
});

exportExcelBtn.addEventListener('click', () => {
    const wsData = [currentFields, ...currentData.map(row => currentFields.map(f => row[f] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, 'report.xlsx');
});
