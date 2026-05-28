const API_KEY = 'AIzaSyDx3Qxt84vJlz_-mXuxiC0W2flaLadr9Ws';
const PROJECT_ID = 'fc-quotation-tool';
const EMAIL = process.env.FC_ADMIN_EMAIL;
const PASSWORD = process.env.FC_ADMIN_PASSWORD;

const COLLECTIONS = [
  { name: 'umrah_quotations', type: 'umrah' },
  { name: 'international_quotations', type: 'international' },
  { name: 'domestic_quotations', type: 'domestic' }
];

if (!EMAIL || !PASSWORD) {
  console.error('Missing credentials. Set FC_ADMIN_EMAIL and FC_ADMIN_PASSWORD, then run: node audit-quotation-ownership.js');
  process.exit(1);
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.error?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return data;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return value;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function docId(docName) {
  return String(docName || '').split('/').pop();
}

async function signIn() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  return requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true })
  });
}

async function listCollection(collectionName, idToken) {
  let pageToken = '';
  const docs = [];
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await requestJson(url, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function stableCloneForComparison(value) {
  if (Array.isArray(value)) return value.map(stableCloneForComparison);
  if (!value || typeof value !== 'object') return value;

  const ignored = new Set([
    'ownerId', 'agentId', 'userId', 'agentData', 'agentName', 'agentPhone',
    'ownerLabel', 'firebaseLabel', 'updatedAt', 'lastSyncedAt', 'syncStatus', 'syncError'
  ]);

  return Object.keys(value)
    .filter(key => !ignored.has(key))
    .sort()
    .reduce((acc, key) => {
      acc[key] = stableCloneForComparison(value[key]);
      return acc;
    }, {});
}

function stableStringify(value) {
  return JSON.stringify(stableCloneForComparison(value));
}

async function main() {
  const auth = await signIn();
  const idToken = auth.idToken;

  const users = (await listCollection('users', idToken)).map(doc => ({
    id: docId(doc.name),
    ...fromFirestoreFields(doc.fields || {})
  }));
  const userMap = new Map(users.map(user => [user.id, user]));

  const allRows = [];
  const ownerSummary = new Map();

  for (const source of COLLECTIONS) {
    const docs = await listCollection(source.name, idToken);
    for (const doc of docs) {
      const ownerId = docId(doc.name);
      const data = fromFirestoreFields(doc.fields || {});
      const quotations = Array.isArray(data.quotations) ? data.quotations : [];
      const owner = userMap.get(ownerId) || {};
      const ownerName = owner.fullName || owner.name || owner.email || ownerId;
      const key = ownerId;
      if (!ownerSummary.has(key)) {
        ownerSummary.set(key, {
          ownerId,
          ownerName,
          role: owner.role || '',
          umrah: 0,
          international: 0,
          domestic: 0,
          total: 0
        });
      }
      ownerSummary.get(key)[source.type] += quotations.length;
      ownerSummary.get(key).total += quotations.length;

      quotations.forEach((quotation, index) => {
        allRows.push({
          collection: source.name,
          type: source.type,
          ownerId,
          ownerName,
          index,
          id: quotation?.id || '',
          status: quotation?.status || '',
          clientName: quotation?.clientData?.name || quotation?.clientName || '',
          createdAt: quotation?.createdAt || '',
          hash: stableStringify(quotation),
          quotation
        });
      });
    }
  }

  const duplicateIds = [];
  const byId = new Map();
  allRows.forEach(row => {
    if (!row.id) return;
    const key = `${row.type}:${row.id}`;
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key).push(row);
  });
  byId.forEach(rows => {
    const ownerIds = new Set(rows.map(row => row.ownerId));
    if (ownerIds.size > 1) duplicateIds.push(rows);
  });

  const duplicateContent = [];
  const byHash = new Map();
  allRows.forEach(row => {
    if (!row.hash) return;
    const key = `${row.type}:${row.hash}`;
    if (!byHash.has(key)) byHash.set(key, []);
    byHash.get(key).push(row);
  });
  byHash.forEach(rows => {
    const ownerIds = new Set(rows.map(row => row.ownerId));
    if (ownerIds.size > 1) duplicateContent.push(rows);
  });

  console.log('\nOwner summary');
  console.table(Array.from(ownerSummary.values()).sort((a, b) => b.total - a.total));

  console.log(`\nTotal quotation rows: ${allRows.length}`);
  console.log(`Duplicate quotation IDs across different owners: ${duplicateIds.length}`);
  console.log(`Duplicate quotation content across different owners: ${duplicateContent.length}`);

  if (duplicateIds.length) {
    console.log('\nDuplicate IDs');
    console.table(duplicateIds.flatMap(rows => rows.map(row => ({
      type: row.type,
      quotationId: row.id,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      status: row.status,
      clientName: row.clientName,
      createdAt: row.createdAt
    }))));
  }

  if (duplicateContent.length) {
    console.log('\nDuplicate content');
    console.table(duplicateContent.flatMap(rows => rows.map(row => ({
      type: row.type,
      quotationId: row.id,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      status: row.status,
      clientName: row.clientName,
      createdAt: row.createdAt
    }))));
  }
}

main().catch(error => {
  console.error('Audit failed:', error.message || error);
  process.exit(1);
});
