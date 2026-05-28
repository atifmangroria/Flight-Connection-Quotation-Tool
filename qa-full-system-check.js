const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = __dirname;
const port = Number(process.env.FC_QA_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;

const pages = {
  umrah: '/index.html',
  international: '/International%20Quotation%20Tool.html',
  domestic: '/Domestic%20Quotation%20Tool.html'
};

const scenarios = [
  { name: 'International - USD currency conversion', type: 'international', currency: 'USD', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'triple' },
  { name: 'International - PKR currency direct pricing', type: 'international', currency: 'PKR', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'triple' },
  { name: 'International - mixed service currencies', type: 'international', currencies: { flight: 'PKR', hotel: 'USD', visa: 'PKR', transfer: 'USD', tour: 'PKR' }, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'triple' },
  { name: 'International - private transfer and private tour', type: 'international', currency: 'PKR', privateTransfer: true, privateTour: true, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'triple' },
  { name: 'International - per-person agent service charge', type: 'international', currency: 'PKR', agentService: { adult: 700, child: 500, infant: 200 }, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'International - add-ons extras', type: 'international', currency: 'PKR', addons: true, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'International - multiple hotels', type: 'international', currency: 'PKR', hotels: 2, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer'], roomPlan: 'quad' },
  { name: 'International - multiple rooms same type with transfer and tour', type: 'international', pax: { adults: 4, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'same' },
  { name: 'International - multiple rooms different type with transfer and tour', type: 'international', pax: { adults: 5, childBed: 1, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'different' },
  { name: 'International - mixed pax without transfer and tour', type: 'international', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'International - mixed pax with transfer and tour', type: 'international', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer', 'tour'], roomPlan: 'triple' },
  { name: 'Umrah - mixed pax with transfer', type: 'umrah', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer'], roomPlan: 'triple' },
  { name: 'Umrah - mixed pax without transfer', type: 'umrah', pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'Umrah - private transfer', type: 'umrah', privateTransfer: true, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer'], roomPlan: 'triple' },
  { name: 'Umrah - per-person agent service charge', type: 'umrah', agentService: { adult: 700, child: 500, infant: 200 }, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'Umrah - custom SAR exchange rate', type: 'umrah', roe: 85, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer'], roomPlan: 'triple' },
  { name: 'Umrah - add-ons extras', type: 'umrah', addons: true, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa'], roomPlan: 'triple' },
  { name: 'Umrah - multiple Makkah and Madina hotels', type: 'umrah', multiCityHotels: true, pax: { adults: 2, childBed: 1, childNoBed: 1, infants: 1 }, services: ['flight', 'hotel', 'visa', 'transfer'], roomPlan: 'triple' },
  { name: 'Domestic - mixed service currencies', type: 'domestic', currencies: { flight: 'PKR', hotel: 'USD', transfer: 'PKR', tour: 'USD' }, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel', 'transfer', 'tour'], roomPlan: 'quad' },
  { name: 'Domestic - private transfer and private tour', type: 'domestic', currency: 'PKR', privateTransfer: true, privateTour: true, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel', 'transfer', 'tour'], roomPlan: 'quad' },
  { name: 'Domestic - per-person agent service charge', type: 'domestic', currency: 'PKR', agentService: { adult: 700, child: 500, infant: 200 }, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel'], roomPlan: 'quad' },
  { name: 'Domestic - add-ons extras', type: 'domestic', currency: 'PKR', addons: true, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel'], roomPlan: 'quad' },
  { name: 'Domestic - multiple hotels', type: 'domestic', currency: 'PKR', hotels: 2, pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel', 'transfer'], roomPlan: 'quad' },
  { name: 'Domestic - family pax with transfer and tour', type: 'domestic', pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel', 'transfer', 'tour'], roomPlan: 'quad' },
  { name: 'Domestic - family pax without transfer and tour', type: 'domestic', pax: { adults: 3, childBed: 1, childNoBed: 0, infants: 1 }, services: ['flight', 'hotel'], roomPlan: 'quad' },
  { name: 'Domestic - adults only flight and hotel', type: 'domestic', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel'], roomPlan: 'double' }
];

const agent = {
  id: 'qa-agent',
  uid: 'qa-agent',
  name: 'QA Agent',
  email: 'qa@example.com',
  phone: '03000000000',
  role: 'admin'
};

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
  }[ext] || 'application/octet-stream';
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, baseURL);
      const decodedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const requested = path.normalize(path.join(root, decodedPath));
      if (!requested.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fs.readFile(requested);
      res.writeHead(200, { 'Content-Type': contentType(requested) });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function setValue(page, selector, value) {
  const loc = page.locator(selector);
  if (!(await loc.count())) return false;
  await loc.first().evaluate((el, val) => {
    el.value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  return true;
}

async function clickIfExists(page, selector) {
  const loc = page.locator(selector);
  if (!(await loc.count())) return false;
  await loc.first().click({ timeout: 5000 });
  return true;
}

async function clickButtonByText(page, text) {
  return page.evaluate(label => {
    const button = [...document.querySelectorAll('button')]
      .find(btn => (btn.textContent || '').toLowerCase().includes(label.toLowerCase()));
    if (!button) return false;
    button.click();
    return true;
  }, text);
}

async function directClick(page, selector) {
  return page.evaluate(sel => {
    const element = document.querySelector(sel);
    if (!element) return false;
    element.click();
    return true;
  }, selector);
}

async function dismissModal(page) {
  await clickButtonByText(page, 'OK');
  await page.waitForTimeout(200);
}

async function activateService(page, label) {
  await page.evaluate(name => {
    const lower = name.toLowerCase();
    const candidates = [...document.querySelectorAll('button, .service-tab')];
    const tab = candidates.find(el => (el.textContent || '').trim().toLowerCase() === lower)
      || candidates.find(el => (el.textContent || '').toLowerCase().includes(lower));
    if (tab) tab.click();
  }, label);
  await page.waitForTimeout(250);
}

async function fillClientAndPax(page, scenario) {
  const start = '2026-07-10';
  const end = '2026-07-17';
  const clientName = `QA_REPORT_${scenario.type}_${Date.now()}`;
  await setValue(page, '#clientName', clientName);
  await page.locator('#reference').selectOption('Walkin').catch(() => null);
  await setValue(page, '#tourDestination', scenario.type === 'domestic' ? 'Karachi' : 'Dubai');
  await setValue(page, '#clientPhone', '03000000000');
  await setValue(page, '#dateFrom', start);
  await setValue(page, '#dateTo', end);
  await setValue(page, '#nightsMakkah', '4');
  await setValue(page, '#nightsMadina', '3');
  await setValue(page, '#numAdult', scenario.pax.adults);
  await setValue(page, '#numChildBed', scenario.pax.childBed);
  await setValue(page, '#numChildNoBed', scenario.pax.childNoBed);
  await setValue(page, '#numInfant', scenario.pax.infants);
  await clickIfExists(page, '#btnSaveClient');
  return clientName;
}

async function addFlight(page, type) {
  await activateService(page, 'Flight');
  if (!(await clickIfExists(page, '#btnAddFlight'))) return;
  const scenario = arguments[2] || {};
  const currency = (type === 'international' || type === 'domestic') ? (scenario.currencies?.flight || scenario.currency || 'USD') : null;
  await setValue(page, '#airline_1', 'QA Air');
  await setValue(page, '#flightFrom_1', 'LHE');
  await setValue(page, '#flightTo_1', type === 'domestic' ? 'KHI' : 'JED');
  await setValue(page, '#flightCostAdult_1', 10000);
  await setValue(page, '#flightSvcAdult_1', 1000);
  await setValue(page, '#flightCostChildBed_1', 8000);
  await setValue(page, '#flightSvcChildBed_1', 800);
  await setValue(page, '#flightCostChildNoBed_1', 8000);
  await setValue(page, '#flightSvcChildNoBed_1', 800);
  await setValue(page, '#flightCostInf_1', 2500);
  await setValue(page, '#flightSvcInf_1', 300);
  if (currency) await page.locator('#flightCurrency_1').selectOption(currency).catch(() => null);
}

async function addHotel(page, scenario) {
  await activateService(page, 'Hotel');
  if (scenario.type === 'umrah') {
    if (await clickIfExists(page, '#btnAddHotelM')) {
      await setValue(page, '#hkNameM_1', 'QA Makkah Hotel');
      await setValue(page, '#hkDistM_1', '350m');
      await setValue(page, '#hkCheckInM_1', '2026-07-10');
      await setValue(page, '#hkCheckOutM_1', '2026-07-14');
      await setValue(page, '#hkNightsM_1', '4');
      await setValue(page, '#hkRoomsM_1', '1');
      await setValue(page, '#hkCostNightM_1', '5000');
      await setValue(page, '#hkSvcNightM_1', '500');
      await page.locator('#hkRoomTypeM_1').selectOption('Triple').catch(() => null);
      await dismissModal(page);
    }
    if (scenario.multiCityHotels && await clickIfExists(page, '#btnAddHotelM')) {
      await setValue(page, '#hkNameM_2', 'QA Makkah Hotel 2');
      await setValue(page, '#hkDistM_2', '500m');
      await setValue(page, '#hkCheckInM_2', '2026-07-12');
      await setValue(page, '#hkCheckOutM_2', '2026-07-14');
      await setValue(page, '#hkNightsM_2', '2');
      await setValue(page, '#hkRoomsM_2', '1');
      await setValue(page, '#hkCostNightM_2', '4200');
      await setValue(page, '#hkSvcNightM_2', '420');
      await page.locator('#hkRoomTypeM_2').selectOption('Triple').catch(() => null);
      await dismissModal(page);
    }
    if (await clickIfExists(page, '#btnAddHotelA')) {
      await setValue(page, '#hkNameA_1', 'QA Madina Hotel');
      await setValue(page, '#hkDistA_1', '250m');
      await setValue(page, '#hkCheckInA_1', '2026-07-14');
      await setValue(page, '#hkCheckOutA_1', '2026-07-17');
      await setValue(page, '#hkNightsA_1', '3');
      await setValue(page, '#hkRoomsA_1', '1');
      await setValue(page, '#hkCostNightA_1', '4500');
      await setValue(page, '#hkSvcNightA_1', '450');
      await page.locator('#hkRoomTypeA_1').selectOption('Triple').catch(() => null);
      await dismissModal(page);
    }
    if (scenario.multiCityHotels && await clickIfExists(page, '#btnAddHotelA')) {
      await setValue(page, '#hkNameA_2', 'QA Madina Hotel 2');
      await setValue(page, '#hkDistA_2', '450m');
      await setValue(page, '#hkCheckInA_2', '2026-07-15');
      await setValue(page, '#hkCheckOutA_2', '2026-07-17');
      await setValue(page, '#hkNightsA_2', '2');
      await setValue(page, '#hkRoomsA_2', '1');
      await setValue(page, '#hkCostNightA_2', '3900');
      await setValue(page, '#hkSvcNightA_2', '390');
      await page.locator('#hkRoomTypeA_2').selectOption('Triple').catch(() => null);
      await dismissModal(page);
    }
    return;
  }
  const button = scenario.type === 'umrah' ? '#btnAddHotelM' : '#btnAddHotel';
  if (!(await clickIfExists(page, button))) return;
  await setValue(page, '#hotelName_1', 'QA Hotel');
  await setValue(page, '#hotelCity_1', scenario.type === 'umrah' ? 'Makkah' : 'Lahore');
  await setValue(page, '#hotelCheckIn_1', '2026-07-10');
  await setValue(page, '#hotelCheckOut_1', '2026-07-17');
  if (await page.locator('.hotelRoomsInp').count()) await page.locator('.hotelRoomsInp').first().fill(scenario.roomPlan === 'same' ? '2' : '1');
  if (await page.locator('.hotelCostNightInp').count()) await page.locator('.hotelCostNightInp').first().fill('5000');
  if (await page.locator('.hotelSvcNightInp').count()) await page.locator('.hotelSvcNightInp').first().fill('500');
  const hotelCurrency = scenario.currencies?.hotel || scenario.currency;
  if (hotelCurrency) await page.locator('.hotelCurrencySel').first().selectOption(hotelCurrency).catch(() => null);

  if (scenario.roomPlan === 'different') {
    await clickButtonByText(page, 'Add Room Type');
    const rows = page.locator('.hotelRoomTypeSel');
    if ((await rows.count()) > 1) {
      await rows.last().selectOption({ label: 'Quad' }).catch(() => rows.last().selectOption('Quad').catch(() => null));
      await page.locator('.hotelRoomsInp').last().fill('1');
      await page.locator('.hotelCostNightInp').last().fill('6500');
      await page.locator('.hotelSvcNightInp').last().fill('650');
      if (hotelCurrency) await page.locator('.hotelCurrencySel').last().selectOption(hotelCurrency).catch(() => null);
    }
  }
  if (scenario.hotels && scenario.hotels > 1) {
    await clickIfExists(page, button);
    await setValue(page, '#hotelName_2', 'QA Hotel 2');
    await setValue(page, '#hotelCity_2', scenario.type === 'domestic' ? 'Islamabad' : 'Dubai');
    await setValue(page, '#hotelCheckIn_2', '2026-07-13');
    await setValue(page, '#hotelCheckOut_2', '2026-07-17');
    const roomRows = page.locator('[id^="hotelRoomTypeRow_"]');
    const rowCount = await roomRows.count().catch(() => 0);
    if (rowCount > 1) {
      const secondRow = roomRows.nth(1);
      await secondRow.locator('.hotelRoomTypeSel').selectOption('Quad').catch(() => null);
      await secondRow.locator('.hotelRoomsInp').fill('1');
      await secondRow.locator('.hotelCostNightInp').fill('4500');
      await secondRow.locator('.hotelSvcNightInp').fill('450');
      if (hotelCurrency) await secondRow.locator('.hotelCurrencySel').selectOption(hotelCurrency).catch(() => null);
    }
    await dismissModal(page);
  }
}

async function configureRooms(page, scenario) {
  await page.evaluate(plan => {
    const roomRows = [...document.querySelectorAll('[id^="hotelRoomTypeRow_"]')];
    const dispatch = el => {
      if (!el) return;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const setRow = (row, type, rooms) => {
      if (!row) return;
      const typeEl = row.querySelector('.hotelRoomTypeSel');
      const roomsEl = row.querySelector('.hotelRoomsInp');
      if (typeEl) {
        typeEl.value = type;
        dispatch(typeEl);
      }
      if (roomsEl) {
        roomsEl.value = String(rooms);
        dispatch(roomsEl);
      }
    };
    if (plan === 'same') setRow(roomRows[0], 'Double', 2);
    if (plan === 'different') {
      setRow(roomRows[0], 'Double', 1);
      setRow(roomRows[1], 'Quad', 1);
    }
    if (plan === 'triple') setRow(roomRows[0], 'Triple', 1);
  }, scenario.roomPlan || '');
}

async function addVisa(page) {
  await activateService(page, 'Visa');
  if (!(await clickIfExists(page, '#btnAddVisa'))) return;
  const scenario = arguments[1] || {};
  const currency = scenario.currencies?.visa || scenario.currency;
  await setValue(page, '#visaCost', 3000);
  await setValue(page, '#visaSvc', 300);
  await setValue(page, '#visaCost_1', 3000);
  await setValue(page, '#visaSvc_1', 300);
  if (currency) {
    await page.locator('#visaCurrency').selectOption(currency).catch(() => null);
    await page.locator('#visaCurrency_1').selectOption(currency).catch(() => null);
  }
}

async function addTransfer(page) {
  await activateService(page, 'Transfer');
  await activateService(page, 'Transport');
  if (!(await clickIfExists(page, '#btnAddTrans'))) return;
  const scenario = arguments[1] || {};
  const currency = scenario.currencies?.transfer || scenario.currency;
  if (scenario.type === 'umrah') {
    if (scenario.privateTransfer) {
      await page.locator('#tType_1').selectOption('Private').catch(() => page.locator('#tType_1').selectOption('private').catch(() => null));
      await setValue(page, '#tCostSAR_1', 9000);
      await setValue(page, '#tSvcSAR_1', 900);
      return;
    }
    await page.locator('#tType_1').selectOption('Sharing').catch(() => page.locator('#tType_1').selectOption('sharing').catch(() => null));
  }
  await setValue(page, '#tFrom_1', 'Airport');
  await setValue(page, '#tTo_1', 'Hotel');
  if (scenario.privateTransfer) {
    await page.locator('#tType_1').selectOption('private').catch(() => null);
    await setValue(page, '#tCost_1', 9000);
    await setValue(page, '#tSvc_1', 900);
    if (currency) await page.locator('#tCurrency_1').selectOption(currency).catch(() => null);
    return;
  }
  await setValue(page, '#tShareCostAdult_1', 1000);
  await setValue(page, '#tShareSvcAdult_1', 100);
  await setValue(page, '#tShareCostChild_1', 900);
  await setValue(page, '#tShareSvcChild_1', 90);
  await setValue(page, '#tShareCostInf_1', 300);
  await setValue(page, '#tShareSvcInf_1', 30);
  if (currency) await page.locator('#tCurrency_1').selectOption(currency).catch(() => null);
}

async function addTour(page) {
  await activateService(page, 'Tours');
  await activateService(page, 'Tour');
  if (!(await clickIfExists(page, '#btnAddTour'))) return;
  const scenario = arguments[1] || {};
  const currency = scenario.currencies?.tour || scenario.currency;
  await setValue(page, '#tourDate_1', '2026-07-12');
  await setValue(page, '#tourName_1', 'QA City Tour');
  if (scenario.privateTour) {
    await page.locator('#tourMode_1').selectOption('private').catch(() => null);
    await setValue(page, '#tourCost_1', 12000);
    await setValue(page, '#tourSvc_1', 1200);
    if (currency) await page.locator('#tourCurrency_1').selectOption(currency).catch(() => null);
    return;
  }
  await page.locator('#tourMode_1').selectOption('sharing').catch(() => null);
  await setValue(page, '#tourShareCostAdult_1', 2000);
  await setValue(page, '#tourShareSvcAdult_1', 200);
  await setValue(page, '#tourShareCostChild_1', 1500);
  await setValue(page, '#tourShareSvcChild_1', 150);
  await setValue(page, '#tourShareCostInf_1', 500);
  await setValue(page, '#tourShareSvcInf_1', 50);
  if (currency) await page.locator('#tourCurrency_1').selectOption(currency).catch(() => null);
}

async function addServices(page, scenario) {
  if (scenario.roe) {
    await setValue(page, '#roeInput', scenario.roe);
    await setValue(page, '#roe', scenario.roe);
  }
  if (scenario.services.includes('flight')) await addFlight(page, scenario.type, scenario);
  if (scenario.services.includes('hotel')) await addHotel(page, scenario);
  if (scenario.services.includes('visa')) await addVisa(page, scenario);
  if (scenario.services.includes('transfer')) await addTransfer(page, scenario);
  if (scenario.services.includes('tour')) await addTour(page, scenario);
  if (scenario.agentService) await addAgentService(page, scenario);
  await configureRooms(page, scenario);
  if (scenario.addons) await addAddons(page, scenario);
}

async function addAddons(page, scenario) {
  await activateService(page, 'Add Extras');
  await activateService(page, 'addons');
  await page.evaluate(async type => {
    if (typeof window.addDirectFlightAddon === 'function') await window.addDirectFlightAddon();
    if (typeof window.addMealTypeAddon === 'function') await window.addMealTypeAddon();
    if (type === 'umrah' && typeof window.addZiyarahAddon === 'function') await window.addZiyarahAddon();
    if (type !== 'umrah' && typeof window.addTourAddon === 'function') await window.addTourAddon();
  }, scenario.type);
  await page.waitForTimeout(500);

  await setValue(page, '#upgradeFlightCostAdult_1', 12000);
  await setValue(page, '#upgradeFlightSvcAdult_1', 1200);
  await setValue(page, '#upgradeFlightCostChildBed_1', 9500);
  await setValue(page, '#upgradeFlightSvcChildBed_1', 950);
  await setValue(page, '#upgradeFlightCostChildNoBed_1', 9200);
  await setValue(page, '#upgradeFlightSvcChildNoBed_1', 920);
  await setValue(page, '#upgradeFlightCostInf_1', 3200);
  await setValue(page, '#upgradeFlightSvcInf_1', 320);

  await page.evaluate(type => {
    const meal = document.querySelector('#mealAddon_1');
    if (meal) {
      const nums = meal.querySelectorAll('input[type="number"]');
      if (nums[0]) nums[0].value = type === 'umrah' ? '15' : '1000';
      if (nums[1]) nums[1].value = type === 'umrah' ? '2' : '100';
      nums.forEach(el => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const currency = meal.querySelector('select[id^="mealCurrency"]');
      if (currency) {
        currency.value = 'PKR';
        currency.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, scenario.type);

  if (scenario.type === 'umrah') {
    await page.locator('#zMode_1').selectOption('Sharing').catch(() => null);
    await setValue(page, '#zShareCostAdult_1', 20);
    await setValue(page, '#zShareSvcAdult_1', 2);
    await setValue(page, '#zShareCostChild_1', 15);
    await setValue(page, '#zShareSvcChild_1', 1);
    await setValue(page, '#zShareCostInf_1', 5);
    await setValue(page, '#zShareSvcInf_1', 1);
    return;
  }

  await setValue(page, '#tourAddonDate_1', '2026-07-12');
  await setValue(page, '#tourAddonName_1', 'QA Addon Tour');
  await page.locator('#tourAddonMode_1').selectOption('sharing').catch(() => null);
  await page.locator('#tourAddonCurrency_1').selectOption('PKR').catch(() => null);
  await setValue(page, '#tourAddonShareCostAdult_1', 800);
  await setValue(page, '#tourAddonShareSvcAdult_1', 80);
  await setValue(page, '#tourAddonShareCostChild_1', 600);
  await setValue(page, '#tourAddonShareSvcChild_1', 60);
  await setValue(page, '#tourAddonShareCostInf_1', 200);
  await setValue(page, '#tourAddonShareSvcInf_1', 20);
}

async function addAgentService(page, scenario) {
  await page.evaluate(() => {
    const input = document.querySelector('input[name="svcOption"][value="perPerson"]');
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof window.toggleServiceOption === 'function') window.toggleServiceOption('perPerson');
  });
  await setValue(page, '#svcPerAdult', scenario.agentService.adult);
  await setValue(page, '#svcPerChild', scenario.agentService.child);
  await setValue(page, '#svcPerInfant', scenario.agentService.infant);
}

function extractLastTotal(text) {
  const matches = [...String(text).matchAll(/(?:Grand Total|Total Package Amount|Package Total|Final Total)[^\d]*(?:PKR|Rs\.?)?\s*([0-9,]+(?:\.\d+)?)/gi)];
  if (!matches.length) return 0;
  return Number(matches[matches.length - 1][1].replace(/,/g, ''));
}

async function extractTotalFrom(page, selector) {
  const text = await page.locator(selector).first().innerText().catch(() => '');
  return extractLastTotal(text);
}

function normalizePaxLabel(label) {
  const value = String(label || '').toLowerCase();
  if (value.includes('inf')) return 'infant';
  if (value.includes('no bed') || value.includes('cnb')) return 'childNoBed';
  if (value.includes('child') || value.includes('cwb')) return 'childBed';
  if (value.includes('adult') || value === 'ad') return 'adult';
  return 'unknown';
}

function extractPackageSection(text) {
  const raw = String(text || '');
  const markers = ['Package Summary', 'Package Price', 'Package Pricing'];
  let start = raw.toLowerCase().lastIndexOf('package summary');
  if (start < 0) start = raw.toLowerCase().lastIndexOf('package price');
  if (start < 0) start = raw.toLowerCase().lastIndexOf('package pricing');
  for (const marker of markers) {
    if (start >= 0) break;
    const idx = raw.toLowerCase().indexOf(marker.toLowerCase());
    if (idx >= 0) start = idx;
  }
  const scoped = start >= 0 ? raw.slice(start) : raw;
  const endMarkers = ['Service Details', 'Update Quotation Status', 'Generate Quotation', 'Export Cost Sheet'];
  let end = scoped.length;
  for (const marker of endMarkers) {
    const idx = scoped.toLowerCase().indexOf(marker.toLowerCase(), 20);
    if (idx > 0 && idx < end) end = idx;
  }
  return scoped.slice(0, end);
}

function parsePackagePriceLines(text) {
  const section = extractPackageSection(text);
  const lines = [];
  const patterns = [
    /\b(Adult|Child \(bed\)|Child \(with bed\)|Child \(no bed\)|Infant|Ad|CWB|CNB|INF)\s*x\s*(\d+)(?:[^\n:]*?)[:：]\s*(?:PKR|Rs\.?|[A-Z]{3})?\s*([0-9,]+(?:\.\d+)?)/gi,
    /\b(Adult|Child \(bed\)|Child \(with bed\)|Child \(no bed\)|Infant|Ad|CWB|CNB|INF)\s*x\s*(\d+)(?:[^\n]*?)\s+(?:PKR|Rs\.?|[A-Z]{3})\s*([0-9,]+(?:\.\d+)?)/gi
  ];
  for (const pattern of patterns) {
    for (const match of section.matchAll(pattern)) {
      lines.push({
        label: normalizePaxLabel(match[1]),
        display: match[1].trim(),
        count: Number(match[2]),
        amount: Number(match[3].replace(/,/g, ''))
      });
    }
    if (lines.length) break;
  }
  return lines;
}

function priceLineTotal(lines) {
  return Math.round(lines.reduce((sum, line) => sum + (line.count * line.amount), 0));
}

function formatPriceLines(lines) {
  if (!lines.length) return '-';
  return lines.map(line => `${line.display} x${line.count}: ${money(line.amount)}`).join('<br>');
}

function validatePassengerPrices(result, source, lines, total, options = {}) {
  result[`${source}PriceLines`] = lines;
  result[`${source}LineTotal`] = priceLineTotal(lines);
  if (!lines.length) {
    result.status = 'FAIL';
    result.notes.push(`${source} passenger package prices were not found.`);
    return;
  }
  if (options.skipLineTotal) return;
  if (Math.abs(result[`${source}LineTotal`] - total) > 2) {
    result.status = 'FAIL';
    result.notes.push(`${source} passenger line total mismatch: lines=${result[`${source}LineTotal`]}, total=${total}`);
  }
}

function expectedAgentServiceTotal(scenario) {
  if (!scenario.agentService) return 0;
  const pax = scenario.pax || {};
  return ((pax.adults || 0) * scenario.agentService.adult)
    + (((pax.childBed || 0) + (pax.childNoBed || 0)) * scenario.agentService.child)
    + ((pax.infants || 0) * scenario.agentService.infant);
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage();
  const result = {
    name: scenario.name,
    type: scenario.type,
    pax: scenario.pax,
    status: 'PASS',
    calculationTotal: 0,
    previewTotal: 0,
    savedTotal: 0,
    calculationPriceLines: [],
    previewPriceLines: [],
    calculationLineTotal: 0,
    previewLineTotal: 0,
    notes: []
  };

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/FirebaseError: Missing or insufficient permissions|Failed to load resource/i.test(text)) return;
    result.notes.push(`Console error: ${text.slice(0, 180)}`);
  });

  try {
    await page.addInitScript(seedAgent => {
      localStorage.setItem('loggedInAgent', JSON.stringify(seedAgent));
      window.alert = () => true;
      window.confirm = () => true;
    }, agent);

    await page.goto(`${baseURL}${pages[scenario.type]}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(seedAgent => localStorage.setItem('loggedInAgent', JSON.stringify(seedAgent)), agent);

    const body = await page.locator('body').innerText({ timeout: 10000 });
    if (/Please login|Access Denied|Unauthorized/i.test(body)) {
      throw new Error('Authentication gate blocked local QA flow.');
    }

    const clientName = await fillClientAndPax(page, scenario);
    await addServices(page, scenario);

    await directClick(page, '#btnCalculate');
    await page.waitForTimeout(500);
    if (await page.locator('#custom-modal').isVisible().catch(() => false)) {
      await clickButtonByText(page, 'Per Room Type');
      await page.waitForTimeout(500);
    }
    await page.locator('#btnGenerateQuotation').waitFor({ state: 'visible', timeout: 10000 });
    result.calculationTotal = await extractTotalFrom(page, 'body');
    const calculationText = await page.locator('body').innerText();
    const agentServiceTotal = expectedAgentServiceTotal(scenario);
    if (agentServiceTotal > 0 && !/Per Person Service|Agent Service|Service \/ Adult/i.test(calculationText)) {
      result.status = 'FAIL';
      result.notes.push(`Agent service charge not visible in calculation summary: expected configured total PKR ${agentServiceTotal.toLocaleString()}`);
    }
    if (process.env.FC_QA_DEBUG_TEXT) {
      await fs.writeFile(path.join(root, `qa-debug-calculation-${scenario.type}.txt`), calculationText, 'utf8');
    }
    if (scenario.addons && !/Add-ons|Addons|Flight Upgrade|Meal|Ziyarah|Addon Tour/i.test(calculationText)) {
      result.status = 'FAIL';
      result.notes.push('Add-ons were not visible in calculation summary.');
    }
    const skipPassengerLineTotal = scenario.addons || scenario.hotels > 1 || scenario.multiCityHotels;
    validatePassengerPrices(result, 'calculation', parsePackagePriceLines(calculationText), result.calculationTotal, { skipLineTotal: skipPassengerLineTotal });

    await directClick(page, '#btnGenerateQuotation');
    await page.waitForTimeout(700);
    await clickButtonByText(page, 'Per Room Type');
    await page.waitForTimeout(700);
    result.previewTotal = await extractTotalFrom(page, '#custom-modal');
    if (!result.previewTotal) result.previewTotal = await extractTotalFrom(page, 'body');
    let previewText = await page.locator('#custom-modal').innerText().catch(() => '');
    if (!previewText.trim()) previewText = await page.locator('body').innerText().catch(() => '');
    if (process.env.FC_QA_DEBUG_TEXT) {
      await fs.writeFile(path.join(root, `qa-debug-preview-${scenario.type}.txt`), previewText, 'utf8');
    }
    validatePassengerPrices(result, 'preview', parsePackagePriceLines(previewText), result.previewTotal, { skipLineTotal: skipPassengerLineTotal });

    const delta = Math.abs(result.calculationTotal - result.previewTotal);
    if (!result.calculationTotal || !result.previewTotal || delta > 2) {
      result.status = 'FAIL';
      result.notes.push(`Calculation/preview mismatch: calculation=${result.calculationTotal}, preview=${result.previewTotal}, delta=${delta}`);
    }

    await directClick(page, '#btnSaveQuotation');
    await page.waitForTimeout(500);
    const saved = await page.evaluate(type => {
      const key = type === 'umrah' ? 'savedQuotations' : `savedQuotations_${type}`;
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      return rows[rows.length - 1] || null;
    }, scenario.type);
    if (!saved) {
      result.status = 'FAIL';
      result.notes.push('Quotation was not saved to localStorage.');
    } else {
      result.savedTotal = Number(
        scenario.addons
          ? (saved.grandTotalPKR || saved.grandTotal || saved.totalAmount || saved.finalTotalSellPKR || saved.packageTotalPKR || 0)
          : (saved.totalAmount || saved.finalTotalSellPKR || saved.packageTotalPKR || saved.grandTotalPKR || saved.grandTotal || 0)
      );
      const savedName = String(saved.clientName || saved.clientData?.name || '');
      if (!savedName.includes(clientName)) {
        result.status = 'FAIL';
        result.notes.push('Saved quotation client did not match current scenario.');
      }
      if (result.savedTotal && Math.abs(result.savedTotal - result.previewTotal) > 2) {
        result.status = 'FAIL';
        result.notes.push(`Saved total does not match preview total: saved=${result.savedTotal}, preview=${result.previewTotal}`);
      }
    }

    if (!skipPassengerLineTotal && Math.abs(result.calculationLineTotal - result.previewLineTotal) > 2) {
      result.status = 'FAIL';
      result.notes.push(`Calculation/preview passenger line totals differ: calculation=${result.calculationLineTotal}, preview=${result.previewLineTotal}`);
    }

  } catch (error) {
    result.status = 'FAIL';
    result.notes.push(error.message);
    result.screenshot = `qa-failed-${scenario.type}-${Date.now()}.png`;
    await page.screenshot({ path: path.join(root, result.screenshot), fullPage: true }).catch(() => null);
  } finally {
    await page.close().catch(() => null);
  }

  result.notes = [...new Set(result.notes)].slice(0, 8);
  return result;
}

function storageKeyForType(type) {
  return type === 'umrah' ? 'savedQuotations' : `savedQuotations_${type}`;
}

function defaultWorkflowScenario(overrides = {}) {
  return {
    name: 'Workflow base quotation',
    type: 'domestic',
    currency: 'PKR',
    pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 },
    services: ['flight', 'hotel'],
    roomPlan: 'double',
    ...overrides
  };
}

async function newSeededPage(browser, type = 'domestic') {
  const page = await browser.newPage();
  await page.addInitScript(seedAgent => {
    localStorage.setItem('loggedInAgent', JSON.stringify(seedAgent));
    window.alert = () => true;
    window.confirm = () => true;
  }, agent);
  await page.goto(`${baseURL}${pages[type]}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.evaluate(seedAgent => localStorage.setItem('loggedInAgent', JSON.stringify(seedAgent)), agent);
  return page;
}

async function calculatePreviewAndSave(page) {
  await directClick(page, '#btnCalculate');
  await page.waitForTimeout(500);
  if (await page.locator('#custom-modal').isVisible().catch(() => false)) {
    await clickButtonByText(page, 'Per Room Type');
    await page.waitForTimeout(400);
  }
  await page.locator('#btnGenerateQuotation').waitFor({ state: 'visible', timeout: 10000 });
  const calculationTotal = await extractTotalFrom(page, 'body');
  await directClick(page, '#btnGenerateQuotation');
  await page.waitForTimeout(600);
  await clickButtonByText(page, 'Per Room Type');
  await page.waitForTimeout(500);
  const previewTotal = (await extractTotalFrom(page, '#custom-modal')) || (await extractTotalFrom(page, 'body'));
  await directClick(page, '#btnSaveQuotation');
  await page.waitForTimeout(500);
  return { calculationTotal, previewTotal };
}

async function createSavedQuotation(page, scenario = defaultWorkflowScenario()) {
  const clientName = await fillClientAndPax(page, scenario);
  await addServices(page, scenario);
  const totals = await calculatePreviewAndSave(page);
  const saved = await page.evaluate(type => {
    const rows = JSON.parse(localStorage.getItem(type === 'umrah' ? 'savedQuotations' : `savedQuotations_${type}`) || '[]');
    return rows[rows.length - 1] || null;
  }, scenario.type);
  return { clientName, totals, saved };
}

function makeWorkflowResult(name) {
  return { name, type: 'workflow', pax: { adults: '-', childBed: '-', childNoBed: '-', infants: '-' }, status: 'PASS', calculationTotal: 0, previewTotal: 0, savedTotal: 0, calculationPriceLines: [], previewPriceLines: [], calculationLineTotal: 0, previewLineTotal: 0, notes: [] };
}

async function runSavedQuotationEditWorkflow(browser) {
  const result = makeWorkflowResult('Saved quotation load, edit, recalculate, save again');
  const scenario = defaultWorkflowScenario();
  const page = await newSeededPage(browser, scenario.type);
  try {
    const created = await createSavedQuotation(page, scenario);
    if (!created.saved?.id) throw new Error('Initial quotation was not saved.');
    const id = created.saved.id;
    const beforeTotal = Number(created.saved.totalAmount || created.saved.finalTotalSellPKR || created.saved.packageTotalPKR || 0);

    await page.evaluate(quotationId => {
      if (typeof window.loadQuotation === 'function') window.loadQuotation(quotationId);
    }, id);
    await page.waitForTimeout(1200);
    await setValue(page, '#flightCostAdult_1', '15000');
    const totals = await calculatePreviewAndSave(page);
    const savedRows = await page.evaluate(({ key, quotationId }) => {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      return {
        count: rows.filter(q => q.id === quotationId).length,
        row: rows.find(q => q.id === quotationId) || null,
        totalRows: rows.length
      };
    }, { key: storageKeyForType(scenario.type), quotationId: id });

    result.calculationTotal = totals.calculationTotal;
    result.previewTotal = totals.previewTotal;
    result.savedTotal = Number(savedRows.row?.totalAmount || savedRows.row?.finalTotalSellPKR || savedRows.row?.packageTotalPKR || 0);
    if (savedRows.count !== 1) {
      result.status = 'FAIL';
      result.notes.push(`Expected one saved row for ${id}, found ${savedRows.count}.`);
    }
    if (result.savedTotal <= beforeTotal) {
      result.status = 'FAIL';
      result.notes.push(`Edited saved total did not increase after changing adult flight cost: before=${beforeTotal}, after=${result.savedTotal}.`);
    }
    if (Math.abs(result.savedTotal - result.previewTotal) > 2) {
      result.status = 'FAIL';
      result.notes.push(`Edited saved total does not match preview: saved=${result.savedTotal}, preview=${result.previewTotal}.`);
    }
  } catch (error) {
    result.status = 'FAIL';
    result.notes.push(error.message);
  } finally {
    await page.close().catch(() => null);
  }
  return result;
}

async function runPublicQuotationLinkWorkflow(browser) {
  const result = makeWorkflowResult('Public quotation link validation');
  const scenario = defaultWorkflowScenario({ type: 'domestic', services: ['flight', 'hotel', 'transfer'] });
  const page = await newSeededPage(browser, scenario.type);
  try {
    const created = await createSavedQuotation(page, scenario);
    const id = created.saved?.id;
    if (!id) throw new Error('Quotation was not saved before link generation.');

    await page.evaluate(quotationId => {
      const rows = JSON.parse(localStorage.getItem('savedQuotations_domestic') || '[]');
      const q = rows.find(row => row.id === quotationId);
      if (!q) return;
      window.currentQuotationId = quotationId;
      if (typeof window.showQuotationPreview === 'function') window.showQuotationPreview(q);
    }, id);
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      if (typeof window.handleGenerateQuotationLink === 'function') {
        window.handleGenerateQuotationLink({ requirePreview: false, silent: true });
      }
    });
    await page.waitForTimeout(900);

    const linked = await page.evaluate(quotationId => {
      const rows = JSON.parse(localStorage.getItem('savedQuotations_domestic') || '[]');
      const q = rows.find(row => row.id === quotationId);
      return q ? {
        id: q.id,
        shareLinkId: q.shareLinkId || '',
        sharePublicUrl: q.sharePublicUrl || '',
        publicQuotationHtml: q.publicQuotationHtml || '',
        shareVersion: q.shareVersion || 0,
        totalAmount: q.totalAmount || q.finalTotalSellPKR || q.packageTotalPKR || 0
      } : null;
    }, id);

    if (!linked?.shareLinkId) {
      result.status = 'FAIL';
      result.notes.push('Share link key was not generated.');
    }
    if (!linked?.sharePublicUrl || !linked.sharePublicUrl.includes('quotation-public.html') || !linked.sharePublicUrl.includes(`id=${encodeURIComponent(id)}`) || !linked.sharePublicUrl.includes('type=domestic') || !linked.sharePublicUrl.includes('key=')) {
      result.status = 'FAIL';
      result.notes.push(`Share URL is invalid: ${linked?.sharePublicUrl || '-'}`);
    }
    if (!linked?.publicQuotationHtml || !linked.publicQuotationHtml.includes(created.clientName)) {
      result.status = 'FAIL';
      result.notes.push('Public quotation HTML snapshot is missing or does not include the client.');
    }
    result.savedTotal = Number(linked?.totalAmount || 0);
  } catch (error) {
    result.status = 'FAIL';
    result.notes.push(error.message);
  } finally {
    await page.close().catch(() => null);
  }
  return result;
}

async function runVoucherWorkflow(browser) {
  const result = makeWorkflowResult('Voucher creation and voucher-view totals');
  const scenario = defaultWorkflowScenario({ type: 'domestic', pax: { adults: 2, childBed: 0, childNoBed: 0, infants: 0 }, services: ['flight', 'hotel', 'transfer'] });
  const quotePage = await newSeededPage(browser, scenario.type);
  let voucherPage = null;
  try {
    const created = await createSavedQuotation(quotePage, scenario);
    const quotation = created.saved;
    if (!quotation?.id) throw new Error('Quotation was not saved before voucher creation.');
    await quotePage.evaluate(quotationId => {
      const rows = JSON.parse(localStorage.getItem('savedQuotations_domestic') || '[]');
      const q = rows.find(row => row.id === quotationId);
      if (q) {
        q.status = 'booked';
        localStorage.setItem('savedQuotations_domestic', JSON.stringify(rows));
      }
    }, quotation.id);

    const storageState = await quotePage.context().storageState();
    const context = await browser.newContext({ storageState });
    voucherPage = await context.newPage();
    voucherPage.on('dialog', dialog => dialog.accept().catch(() => null));
    await voucherPage.goto(`${baseURL}/domestic-voucher.html?quotationId=${encodeURIComponent(quotation.id)}&owner=${encodeURIComponent(agent.id)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await voucherPage.waitForTimeout(1500);
    await voucherPage.locator('[id^="paxGiven_"]').first().waitFor({ state: 'visible', timeout: 10000 });
    await voucherPage.locator('[id^="fPnr_"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
    await voucherPage.evaluate(() => {
      document.querySelectorAll('[id^="paxGiven_"]').forEach((el, index) => {
        el.value = `QA${index + 1}`;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.querySelectorAll('[id^="paxSurname_"]').forEach((el) => {
        el.value = 'Passenger';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.querySelectorAll('[id^="paxPassport_"]').forEach((el, index) => {
        el.value = `QA1234${index}`;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.querySelectorAll('[id^="paxNationality_"]').forEach((el) => {
        el.value = 'PK';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.querySelectorAll('[id^="fPnr_"]').forEach((el) => {
        el.value = 'QAPNR1';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    const voucherValidationErrors = await voucherPage.evaluate(() => {
      if (typeof window.syncAllPassengerData === 'function') window.syncAllPassengerData();
      if (typeof window.collectFormData === 'function' && typeof window.validateForPublish === 'function') {
        return window.validateForPublish(window.collectFormData());
      }
      return ['Voucher validation helpers unavailable'];
    }).catch(error => [error.message]);
    await voucherPage.evaluate(() => {
      Object.defineProperty(window, 'auth', {
        value: { currentUser: { uid: 'qa-agent', email: 'qa@example.com' } },
        configurable: true,
        writable: true
      });
      window.open = () => null;
      window.firebaseDB = {
        saveData: async () => true,
        getData: async () => null,
        findByField: async () => []
      };
    });
    if (voucherValidationErrors.length) {
      result.status = 'FAIL';
      result.notes.push(`Voucher validation errors before publish: ${voucherValidationErrors.join('; ')}`);
    }
    await directClick(voucherPage, '#btnPublish');
    await voucherPage.waitForTimeout(500);
    await directClick(voucherPage, '#confirmYes');
    await voucherPage.waitForTimeout(1000);

    const voucherState = await voucherPage.evaluate(() => ({
      voucherId: document.querySelector('#sbVoucherId')?.textContent?.trim() || '',
      link: document.querySelector('#voucherLinkInput')?.value || '',
      status: document.querySelector('#sbBadge')?.textContent || '',
      subtitle: document.querySelector('#pageSubtitle')?.textContent || '',
      bodyText: document.body.innerText || ''
    }));
    if (!voucherState.voucherId || voucherState.voucherId === '-') {
      result.status = 'FAIL';
      result.notes.push('Voucher ID was not generated.');
    }
    if (!/published/i.test(voucherState.status || '')) {
      result.status = 'FAIL';
      result.notes.push(`Voucher was not published. Status=${voucherState.status || '-'}`);
    }
    if (!voucherState.link || !voucherState.link.includes('domestic-voucher-view.html?id=')) {
      result.status = 'FAIL';
      result.notes.push(`Voucher view link missing or invalid: ${voucherState.link || '-'}`);
    }
    if (!voucherState.subtitle.includes(quotation.id) && !voucherState.bodyText.includes(quotation.id)) {
      result.status = 'FAIL';
      result.notes.push('Voucher page does not reference the source quotation.');
    }
    if (!voucherState.bodyText.includes(quotation.clientData?.name || '')) {
      result.status = 'FAIL';
      result.notes.push('Voucher client does not match quotation client.');
    }
    if (result.status === 'FAIL') {
      result.notes.push(`Voucher page state: ${String(voucherState.bodyText || '').slice(0, 240).replace(/\s+/g, ' ')}`);
    }
    result.savedTotal = Number(quotation.totalAmount || quotation.finalTotalSellPKR || quotation.packageTotalPKR || 0);
    await context.close().catch(() => null);
  } catch (error) {
    result.status = 'FAIL';
    result.notes.push(error.message);
  } finally {
    await voucherPage?.close().catch(() => null);
    await quotePage.close().catch(() => null);
  }
  return result;
}

async function runValidationWorkflow(browser) {
  const result = makeWorkflowResult('Validation/error cases');
  let page = null;
  try {
    const checkBlockedClientSave = async (label, values) => {
      if (page) await page.close().catch(() => null);
      page = await newSeededPage(browser, 'domestic');
      await page.evaluate(() => {
        localStorage.removeItem('savedClientData_domestic');
        if (typeof window.isClientDataSaved !== 'undefined') window.isClientDataSaved = false;
      });
      await setValue(page, '#clientName', values.clientName ?? 'QA Validation');
      await setValue(page, '#clientPhone', values.clientPhone ?? '03000000000');
      await page.locator('#reference').selectOption(values.reference ?? '').catch(() => null);
      await setValue(page, '#tourDestination', values.tourDestination ?? 'Karachi');
      await setValue(page, '#dateFrom', values.dateFrom ?? '2026-07-10');
      await setValue(page, '#dateTo', values.dateTo ?? '2026-07-17');
      await setValue(page, '#numAdult', values.adults ?? 2);
      await setValue(page, '#numChildBed', values.childBed ?? 0);
      await setValue(page, '#numChildNoBed', values.childNoBed ?? 0);
      await setValue(page, '#numInfant', values.infants ?? 0);
      await directClick(page, '#btnSaveClient');
      await page.waitForTimeout(400);
      const saved = await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('savedClientData_domestic') || 'null');
        return { saved: !!data, data };
      });
      if (saved.saved) {
        result.status = 'FAIL';
        result.notes.push(`${label} was not blocked.`);
      }
      await page.evaluate(() => {
        const modal = document.querySelector('#custom-modal');
        if (modal) modal.classList.remove('visible');
      }).catch(() => null);
    };

    await checkBlockedClientSave('Missing reference', { reference: '' });
    await checkBlockedClientSave('Invalid dates', { reference: 'Walkin', dateFrom: '2026-07-17', dateTo: '2026-07-10' });
    await checkBlockedClientSave('Zero adults', { reference: 'Walkin', adults: 0 });

    if (page) await page.close().catch(() => null);
    page = await newSeededPage(browser, 'domestic');
    const capacityScenario = defaultWorkflowScenario({ pax: { adults: 5, childBed: 0, childNoBed: 0, infants: 0 }, services: ['hotel'], roomPlan: 'single' });
    await fillClientAndPax(page, capacityScenario);
    await addHotel(page, capacityScenario);
    await page.locator('#hotelRoomType_1').selectOption('Single').catch(() => null);
    await setValue(page, '#hotelRooms_1', '1');
    const capacityValid = await page.evaluate(() => typeof window.validateAllHotels === 'function' ? window.validateAllHotels(false) : null);
    if (capacityValid !== false) {
      result.status = 'FAIL';
      result.notes.push('Insufficient room capacity was not blocked.');
    }
  } catch (error) {
    result.status = 'FAIL';
    result.notes.push(error.message);
  } finally {
    await page?.close().catch(() => null);
  }
  return result;
}

async function runWorkflowChecks(browser, filter = '') {
  const checks = [
    runSavedQuotationEditWorkflow,
    runPublicQuotationLinkWorkflow,
    runVoucherWorkflow,
    runValidationWorkflow
  ];
  const names = [
    'Saved quotation load, edit, recalculate, save again',
    'Public quotation link validation',
    'Voucher creation and voucher-view totals',
    'Validation/error cases'
  ];
  const selected = checks
    .map((fn, index) => ({ fn, name: names[index] }))
    .filter(check => !filter || check.name.toLowerCase().includes(filter) || filter === 'workflow');
  const results = [];
  for (const check of selected) {
    process.stdout.write(`Running workflow: ${check.name}\n`);
    results.push(await check.fn(browser));
  }
  return results;
}

function money(value) {
  return value ? `PKR ${Number(value).toLocaleString()}` : '-';
}

function htmlReport(results) {
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.length - passed;
  const rows = results.map(r => `
    <tr class="${r.status.toLowerCase()}">
      <td>${r.status}</td>
      <td>${r.name}</td>
      <td>${r.type}</td>
      <td>A:${r.pax.adults}, CWB:${r.pax.childBed}, CNB:${r.pax.childNoBed}, INF:${r.pax.infants}</td>
      <td>${formatPriceLines(r.calculationPriceLines)}</td>
      <td>${formatPriceLines(r.previewPriceLines)}</td>
      <td>${money(r.calculationTotal)}</td>
      <td>${money(r.previewTotal)}</td>
      <td>${money(r.savedTotal)}</td>
      <td>${r.notes.length ? r.notes.map(n => `<div>${escapeHtml(n)}</div>`).join('') : 'OK'}</td>
    </tr>
  `).join('');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Flight Connection Full System QA Report</title>
  <style>
    body { font-family: Arial, sans-serif; color: #172033; margin: 32px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .meta { color: #5b667a; margin-bottom: 24px; }
    .summary { display: flex; gap: 12px; margin-bottom: 22px; }
    .box { border: 1px solid #d9e0ea; padding: 12px 16px; border-radius: 6px; min-width: 120px; }
    .box strong { display: block; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d9e0ea; padding: 8px; vertical-align: top; }
    th { background: #eef3f8; text-align: left; }
    tr.pass td:first-child { color: #0f7a34; font-weight: 700; }
    tr.fail td:first-child { color: #b00020; font-weight: 700; }
    .section { margin-top: 24px; }
    ul { margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Flight Connection Full System QA Report</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} from local browser automation at ${baseURL}</div>
  <div class="summary">
    <div class="box"><strong>${results.length}</strong>Total scenarios</div>
    <div class="box"><strong>${passed}</strong>Passed</div>
    <div class="box"><strong>${failed}</strong>Failed</div>
  </div>
  <div class="section">
    <h2>Scenario Results</h2>
    <table>
      <thead><tr><th>Status</th><th>Scenario</th><th>Tool</th><th>Pax</th><th>Calculation Pax Prices</th><th>Preview Pax Prices</th><th>Calculation Total</th><th>Preview Total</th><th>Saved Total</th><th>Notes</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <div class="section">
    <h2>Coverage</h2>
    <ul>
      <li>Multiple rooms with same room type</li>
      <li>Multiple rooms with different room types</li>
      <li>Different pax groups: adults, child with bed, child no bed, infants</li>
      <li>Passenger package prices reconstructed from adult, child-with-bed, child-without-bed, and infant display lines</li>
      <li>With-transfer/tour and without-transfer/tour scenarios</li>
      <li>Calculation summary total compared with quotation preview total</li>
      <li>Quotation save flow checked against saved local data</li>
      <li>Saved quotation load/edit/recalculate/save regression</li>
      <li>Public quotation link structure and snapshot validation</li>
      <li>Voucher creation/publish link regression without live Firebase writes</li>
      <li>Validation/error cases: missing reference, invalid dates, zero adults, insufficient room capacity</li>
    </ul>
  </div>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    for (const file of await fs.readdir(root)) {
    if (/^qa-(failed-|umrah-|international-|domestic-).+\.png$/i.test(file)) {
        await fs.unlink(path.join(root, file)).catch(() => null);
      }
    }
    const filter = String(process.env.FC_QA_FILTER || '').toLowerCase();
    const selectedScenarios = filter
      ? scenarios.filter(scenario => scenario.name.toLowerCase().includes(filter))
      : scenarios;
    const results = [];
    for (const scenario of selectedScenarios) {
      process.stdout.write(`Running: ${scenario.name}\n`);
      results.push(await runScenario(browser, scenario));
    }
    results.push(...await runWorkflowChecks(browser, filter));
    const reportHtml = htmlReport(results);
    const htmlPath = path.join(root, 'qa-report.html');
    const pdfPath = path.join(root, 'qa-report.pdf');
    await fs.writeFile(htmlPath, reportHtml, 'utf8');
    const reportPage = await browser.newPage();
    await reportPage.goto(`file://${htmlPath.replace(/\\/g, '/')}`);
    await reportPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '14mm', right: '10mm', bottom: '14mm', left: '10mm' } });
    await reportPage.close();
    console.table(results.map(r => ({
      status: r.status,
      scenario: r.name,
      calculation: r.calculationTotal,
      preview: r.previewTotal,
      saved: r.savedTotal,
      notes: r.notes.join(' | ')
    })));
    process.exitCode = results.some(r => r.status === 'FAIL') ? 1 : 0;
  } finally {
    await browser.close().catch(() => null);
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
