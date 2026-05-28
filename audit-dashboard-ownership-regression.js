const fs = require('node:fs');
const path = require('node:path');

const dashboardPath = path.join(__dirname, 'dashboard.html');
const source = fs.readFileSync(dashboardPath, 'utf8');

const checks = [
  {
    check: 'Admin All Users loads each user by explicit owner id',
    pass: /const\s+userOwnerId\s*=\s*userData\.uid\s*\|\|\s*userData\.id/.test(source)
      && /loadQuotationsFromFirebase\(userData,\s*userOwnerId\)/.test(source)
  },
  {
    check: 'All Users button is admin-only',
    pass: /if\s*\(\s*agent\.role\s*===\s*['"]admin['"]\s*\)[\s\S]*allUsersBtn[\s\S]*style\.display\s*=\s*['"]inline-block['"]/.test(source)
  },
  {
    check: 'Agent view uses own quotations, not all-users aggregate',
    pass: /if\s*\(\s*agent\s*&&\s*agent\.role\s*===\s*['"]admin['"]\s*&&\s*viewMode\s*===\s*['"]all-users['"]\s*\)[\s\S]*baseQuotations\s*=\s*allUsersQuotations[\s\S]*else\s*{[\s\S]*baseQuotations\s*=\s*\[\.\.\.allUmrahQuotations,\s*\.\.\.allInternationalQuotations,\s*\.\.\.allDomesticQuotations\]/.test(source)
  },
  {
    check: 'Transfer button passes row owner as source owner',
    pass: /transferQuotation\('\$\{quotation\.id\}',\s*'\$\{quotation\.type\}',\s*'\$\{quotation\.agentId\s*\|\|\s*''\}'\)/.test(source)
  },
  {
    check: 'Delete button passes row owner as delete owner hint',
    pass: /deleteQuotation\('\$\{quotation\.id\}',\s*'\$\{quotation\.type\}',\s*'\$\{quotation\.agentId\s*\|\|\s*''\}'\)/.test(source)
  },
  {
    check: 'Delete resolves owner hint before logged-in admin fallback',
    pass: /const\s+ownerId\s*=\s*ownerIdHint\s*\|\|\s*findQuotationOwnerId\(quotationId,\s*quotationType\)\s*\|\|\s*getOwnerId\(agent\)/.test(source)
  },
  {
    check: 'Transfer moves quotation out of source owner and into target owner',
    pass: /const\s+sourceRef\s*=\s*doc\(db,\s*collectionName,\s*fromAgentId\)/.test(source)
      && /const\s+targetRef\s*=\s*doc\(db,\s*collectionName,\s*toAgentId\)/.test(source)
      && /sourceList\.splice\(sourceIndex,\s*1\)/.test(source)
      && /targetList\.push\(transferRecord\)/.test(source)
  },
  {
    check: 'Delete marks quotation in source owner document, not a copied admin row',
    pass: /const\s+ref\s*=\s*doc\(db,\s*collectionName,\s*ownerId\)/.test(source)
      && /serverList\[index\]\s*=\s*deletedQuotation/.test(source)
      && /deletedFromOwner:\s*ownerId/.test(source)
  }
];

console.table(checks);
if (checks.some(check => !check.pass)) {
  process.exitCode = 1;
}
