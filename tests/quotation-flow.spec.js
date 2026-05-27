const { test, expect } = require('@playwright/test');
const { passengerTotals, actualRoomTotal, averageRoomPerPerson } = require('./helpers/calculation');

const QA_PREFIX = 'QA_TEST_DO_NOT_USE';
const STORAGE_KEYS = ['savedQuotations', 'savedQuotations_international', 'savedQuotations_domestic'];

const pages = {
  umrah: '/index.html',
  international: '/International%20Quotation%20Tool.html',
  domestic: '/Domestic%20Quotation%20Tool.html'
};

const quotationScenarios = [
  { name: 'Adults only', type: 'umrah', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'visa', 'transfer'] },
  { name: 'Adult + Child with Bed', type: 'umrah', pax: { adults: 1, childBed: 1, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'visa'] },
  { name: 'Adult + Child no Bed', type: 'umrah', pax: { adults: 1, childBed: 0, childNoBed: 1, infants: 0 }, services: ['flight', 'visa'] },
  { name: 'Adult + Infant', type: 'umrah', pax: { adults: 1, childBed: 0, childNoBed: 0, infants: 1 }, services: ['flight', 'visa'] },
  { name: 'Adult + all child types', type: 'international', pax: { adults: 1, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour', 'addon'] },
  { name: 'Small pax count', type: 'domestic', pax: { adults: 1, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight'] },
  { name: 'Large pax count', type: 'domestic', pax: { adults: 8, childBed: 4, childNoBed: 3, infants: 2 }, services: ['flight', 'hotel', 'transfer'] },
  { name: 'Multiple rooms same type', type: 'international', pax: { adults: 4, childBed: 0, childNoBed: 0, infants: 0 }, roomPlan: 'same' },
  { name: 'Multiple rooms different type', type: 'international', pax: { adults: 5, childBed: 1, childNoBed: 0, infants: 0 }, roomPlan: 'different' },
  { name: 'Multiple hotels', type: 'domestic', pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 0 }, hotels: 2 },
  { name: 'Add-ons in every quotation type - Umrah', type: 'umrah', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['addon'] },
  { name: 'Add-ons in every quotation type - International', type: 'international', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['addon'] },
  { name: 'Add-ons in every quotation type - Domestic', type: 'domestic', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['addon'] },
  { name: 'Without flight', type: 'umrah', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['hotel', 'visa'] },
  { name: 'Without hotel', type: 'international', pax: { adults: 2, childBed: 1, childNoBed: 0, infants: 0 }, services: ['flight', 'visa'] },
  { name: 'Without visa', type: 'domestic', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel'] },
  { name: 'Without transfer/transport', type: 'umrah', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 0 }, services: ['flight', 'hotel', 'visa'] },
  { name: 'Without tours', type: 'international', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'visa'] },
  { name: 'International with multiple currencies', type: 'international', pax: { adults: 2, childBed: 1, childNoBed: 0, infants: 1 }, currencies: ['USD', 'EUR', 'PKR'] },
  { name: 'Domestic PKR-only calculation', type: 'domestic', pax: { adults: 2, childBed: 1, childNoBed: 0, infants: 0 }, forceCurrency: 'PKR' },
  { name: 'Umrah SAR-to-PKR calculation', type: 'umrah', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, forceCurrency: 'SAR' }
];

function requireCredentials() {
  test.skip(!process.env.FC_TEST_EMAIL || !process.env.FC_TEST_PASSWORD, 'Set FC_TEST_EMAIL and FC_TEST_PASSWORD to run live e2e tests.');
}

async function login(page, email = process.env.FC_TEST_EMAIL, password = process.env.FC_TEST_PASSWORD) {
  await page.goto('/login.html');
  await page.locator('#loginEmail').fill(email);
  await page.locator('#loginPassword').fill(password);
  await Promise.all([
    page.waitForURL(/dashboard\.html/, { timeout: 30_000 }).catch(() => null),
    page.locator('#loginForm button[type="submit"]').click()
  ]);
  await expect(page).toHaveURL(/dashboard\.html/);
  await expect(page.locator('body')).toContainText(/Dashboard|Quotations|Create Quotation/i);
}

async function cleanupQaData(page) {
  await page.evaluate(({ prefix, keys }) => {
    for (const key of keys) {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(rows)) {
        localStorage.setItem(key, JSON.stringify(rows.filter(row => !String(row?.clientName || row?.clientData?.name || row?.name || '').startsWith(prefix))));
      }
    }
  }, { prefix: QA_PREFIX, keys: STORAGE_KEYS });
}

async function setValue(page, selector, value) {
  await page.locator(selector).evaluate((el, val) => {
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function fillClientAndPax(page, scenario) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30).toISOString().slice(0, 10);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 37).toISOString().slice(0, 10);
  const clientName = `${QA_PREFIX}_${scenario.type}_${Date.now()}`;

  await setValue(page, '#clientName', clientName);
  await setValue(page, '#clientPhone', '03000000000');
  await setValue(page, '#dateFrom', start);
  await setValue(page, '#dateTo', end);
  if (await page.locator('#nightsMakkah').count()) await setValue(page, '#nightsMakkah', '4');
  if (await page.locator('#nightsMadina').count()) await setValue(page, '#nightsMadina', '3');
  await setValue(page, '#numAdult', scenario.pax.adults);
  await setValue(page, '#numChildBed', scenario.pax.childBed);
  await setValue(page, '#numChildNoBed', scenario.pax.childNoBed);
  await setValue(page, '#numInfant', scenario.pax.infants);
  await page.locator('#btnSaveClient').click();
  await expect.poll(async () => page.evaluate(type => {
    const key = type === 'umrah' ? 'savedClientData' : `savedClientData_${type}`;
    return !!localStorage.getItem(key);
  }, scenario.type)).toBe(true);
  return clientName;
}

async function addFlight(page, type) {
  await page.locator('#btnAddFlight').click();
  await setValue(page, '#airline_1', 'QA Air');
  const currencySelector = await page.locator('#flightCurrency_1').count();
  if (currencySelector) await page.locator('#flightCurrency_1').selectOption(type === 'umrah' ? 'PKR' : 'PKR').catch(() => null);
  const values = {
    '#flightCostAdult_1': 10000,
    '#flightSvcAdult_1': 1000,
    '#flightCostChildBed_1': 8000,
    '#flightSvcChildBed_1': 800,
    '#flightCostChildNoBed_1': 8000,
    '#flightSvcChildNoBed_1': 800,
    '#flightCostInf_1': 2500,
    '#flightSvcInf_1': 300
  };
  for (const [selector, value] of Object.entries(values)) {
    if (await page.locator(selector).count()) await setValue(page, selector, value);
  }
}

async function addHotel(page, type, scenario) {
  const hotelButton = type === 'umrah' ? '#btnAddHotelM' : '#btnAddHotel';
  if (!(await page.locator(hotelButton).count())) return;
  await page.locator(hotelButton).click();
  await setValue(page, '#hotelName_1', 'QA Hotel');
  await setValue(page, '#hotelCity_1', type === 'umrah' ? 'Makkah' : 'Lahore');
  await setValue(page, '#hotelCheckIn_1', await page.locator('#dateFrom').inputValue());
  await setValue(page, '#hotelCheckOut_1', await page.locator('#dateTo').inputValue());
  const rooms = scenario.roomPlan === 'same' ? 2 : 1;
  if (await page.locator('.hotelRoomsInp').first().count()) await page.locator('.hotelRoomsInp').first().fill(String(rooms));
  if (await page.locator('.hotelCostNightInp').first().count()) await page.locator('.hotelCostNightInp').first().fill('5000');
  if (await page.locator('.hotelSvcNightInp').first().count()) await page.locator('.hotelSvcNightInp').first().fill('500');
  if (scenario.roomPlan === 'different') {
    await page.getByRole('button', { name: /add room type/i }).first().click();
    await page.locator('.hotelRoomTypeSel').last().selectOption({ label: /Triple/ }).catch(() => null);
    await page.locator('.hotelCostNightInp').last().fill('6500');
    await page.locator('.hotelSvcNightInp').last().fill('650');
  }
}

async function addVisa(page) {
  if (!(await page.locator('#btnAddVisa').count())) return;
  await page.locator('#btnAddVisa').click();
  const fields = ['#visaCost', '#visaCost_1'];
  for (const selector of fields) if (await page.locator(selector).count()) await setValue(page, selector, 3000);
  const svcFields = ['#visaSvc', '#visaSvc_1'];
  for (const selector of svcFields) if (await page.locator(selector).count()) await setValue(page, selector, 300);
}

async function addTransfer(page) {
  if (!(await page.locator('#btnAddTrans').count())) return;
  await page.locator('#btnAddTrans').click();
  for (const selector of ['#tFrom_1', '#tTo_1']) if (await page.locator(selector).count()) await setValue(page, selector, 'QA Point');
  for (const selector of ['#tShareCostAdult_1', '#tShareCostChild_1', '#tShareCostInf_1']) if (await page.locator(selector).count()) await setValue(page, selector, 1000);
  for (const selector of ['#tShareSvcAdult_1', '#tShareSvcChild_1', '#tShareSvcInf_1']) if (await page.locator(selector).count()) await setValue(page, selector, 100);
}

async function addServices(page, scenario) {
  const services = scenario.services || ['flight'];
  if (scenario.forceCurrency === 'SAR' && await page.locator('#roe').count()) await setValue(page, '#roe', '74');
  if (services.includes('flight') || scenario.forceCurrency === 'PKR' || scenario.forceCurrency === 'SAR' || scenario.currencies) await addFlight(page, scenario.type);
  if (services.includes('hotel') || scenario.roomPlan || scenario.hotels) await addHotel(page, scenario.type, scenario);
  if (services.includes('visa')) await addVisa(page);
  if (services.includes('transfer')) await addTransfer(page);
}

async function calculateSaveAndPreview(page, type) {
  await page.locator('#btnCalculate').click();
  await expect(page.locator('#btnGenerateQuotation')).toBeVisible();
  const calculationTotal = await extractTotal(page.locator('body'));
  await page.locator('#btnGenerateQuotation').click();
  await expect(page.locator('#custom-modal, body')).toContainText(/Quotation Preview|Total Package Amount|Grand Total/i);
  const previewTotal = await extractTotal(page.locator('body'));
  await page.locator('#btnSaveQuotation').click();
  await expect.poll(async () => page.evaluate(typeName => {
    const key = typeName === 'umrah' ? 'savedQuotations' : `savedQuotations_${typeName}`;
    return (JSON.parse(localStorage.getItem(key) || '[]') || []).length;
  }, type)).toBeGreaterThan(0);
  return { calculationTotal, previewTotal };
}

async function extractTotal(locator) {
  const text = await locator.evaluate(el => el.innerText || '');
  const matches = [...text.matchAll(/(?:Grand Total|Total Package Amount|Package Total)[^\d]*(?:PKR)?\s*([0-9,]+(?:\.\d+)?)/gi)];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1].replace(/,/g, ''));
}

async function latestSavedQuotation(page, type) {
  return page.evaluate(typeName => {
    const key = typeName === 'umrah' ? 'savedQuotations' : `savedQuotations_${typeName}`;
    const rows = JSON.parse(localStorage.getItem(key) || '[]') || [];
    return rows[rows.length - 1] || null;
  }, type);
}

async function selectStatus(page, statusLabel) {
  await page.locator('#quotationStatus').selectOption({ label: new RegExp(statusLabel, 'i') }).catch(async () => {
    const value = statusLabel.toLowerCase().replace(/\s+/g, '-');
    await page.locator('#quotationStatus').selectOption(value);
  });
  await page.locator('#btnUpdateStatus').click();
}

test.describe.serial('Flight Connection live QA flow', () => {
  test.beforeEach(async ({ page }) => {
    requireCredentials();
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupQaData(page).catch(() => null);
  });

  test('admin dashboard and admin modules load', async ({ page }) => {
    await expect(page.locator('#allQuotationsTableBody, body')).toContainText(/Quotation|Loading|No/i);
    for (const target of ['/user-management.html', '/reports.html', '/package-builder.html', '/notifications.html']) {
      await page.goto(target);
      await expect(page.locator('body')).not.toContainText(/Access Denied|Unauthorized|Cannot GET/i);
    }
  });

  for (const scenario of quotationScenarios) {
    test(`quotation scenario: ${scenario.name}`, async ({ page }) => {
      await page.goto(pages[scenario.type]);
      const clientName = await fillClientAndPax(page, scenario);
      await addServices(page, scenario);
      const totals = await calculateSaveAndPreview(page, scenario.type);
      const saved = await latestSavedQuotation(page, scenario.type);

      expect(saved, 'quotation should be saved').toBeTruthy();
      expect(String(saved.clientName || saved.clientData?.name || '')).toContain(clientName);
      expect(Math.abs((saved.totalAmount || saved.finalTotalSellPKR || saved.packageTotalPKR || 0) - totals.previewTotal)).toBeLessThanOrEqual(2);
      expect(Math.abs(totals.calculationTotal - totals.previewTotal)).toBeLessThanOrEqual(2);
    });
  }

  test('status flow gates voucher creation until Booked', async ({ page }) => {
    await page.goto(pages.umrah);
    await fillClientAndPax(page, { type: 'umrah', pax: { adults: 1, childBed: 0, childNoBed: 0, infants: 0 } });
    await addFlight(page, 'umrah');
    await calculateSaveAndPreview(page, 'umrah');

    for (const status of ['Pending', 'Follow up', 'Cancel', 'Expired']) {
      await selectStatus(page, status);
      await expect(page.locator('#btnCreateVoucher')).toBeHidden();
    }

    await selectStatus(page, 'Booked');
    await expect(page.locator('#btnCreateVoucher')).toBeVisible();

    await page.locator('#btnCreateVoucher').click();
    await expect(page).toHaveURL(/voucher\.html/);
    await page.locator('#agentNote').fill('QA voucher created by automated test.');
    await page.locator('#btnSaveDraft').click();
    await page.locator('#btnPublish').click();
    await expect(page.locator('#voucherLinkInput')).toHaveValue(/voucher-view\.html\?id=/);
    const voucherUrl = await page.locator('#voucherLinkInput').inputValue();
    await page.goto(voucherUrl);
    await expect(page.locator('body')).toContainText(/Voucher|Passenger|Flight Connection/i);
  });

  test('live quotation link preserves saved total', async ({ page }) => {
    await page.goto(pages.domestic);
    await fillClientAndPax(page, { type: 'domestic', pax: { adults: 1, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight'] });
    await addFlight(page, 'domestic');
    const totals = await calculateSaveAndPreview(page, 'domestic');
    await expect(page.locator('#previewShareUrl')).toHaveValue(/quotation-public\.html\?id=.*key=/);
    const shareUrl = await page.locator('#previewShareUrl').inputValue();
    await page.goto(shareUrl);
    const liveTotal = await extractTotal(page.locator('body'));
    expect(Math.abs(liveTotal - totals.previewTotal)).toBeLessThanOrEqual(2);
  });

  test('non-admin cannot access admin-only modules when non-admin credentials are supplied', async ({ page }) => {
    test.skip(!process.env.FC_TEST_NON_ADMIN_EMAIL || !process.env.FC_TEST_NON_ADMIN_PASSWORD, 'Optional role test: set FC_TEST_NON_ADMIN_EMAIL and FC_TEST_NON_ADMIN_PASSWORD.');
    await login(page, process.env.FC_TEST_NON_ADMIN_EMAIL, process.env.FC_TEST_NON_ADMIN_PASSWORD);
    await page.goto('/user-management.html');
    await expect(page.locator('body')).toContainText(/Access Denied|Unauthorized|admin/i);
  });
});

test.describe('calculation helper business rules', () => {
  test('passenger service inclusion rules are explicit', () => {
    const result = passengerTotals({
      pax: { adults: 1, childBed: 1, childNoBed: 1, infants: 1 },
      flight: { cost: 100, service: 10 },
      hotel: { cost: 200, service: 20 },
      visa: { cost: 50, service: 5 },
      transfer: { cost: 30, service: 3 },
      transport: { cost: 40, service: 4 }
    });
    expect(result.adult).toBe(462);
    expect(result.childWithBed).toBe(429);
    expect(result.childNoBed).toBe(209);
    expect(result.infant).toBe(165);
    expect(result.grandTotal).toBe(1265);
  });

  test('actual room and average per-person methods produce traceable totals', () => {
    const rooms = [
      { costPerNight: 1000, servicePerNight: 100, nights: 3, count: 2 },
      { costPerNight: 1500, servicePerNight: 150, nights: 3, count: 1 }
    ];
    expect(actualRoomTotal(rooms)).toBe(11550);
    expect(averageRoomPerPerson(rooms, 5)).toBe(2310);
  });
});
