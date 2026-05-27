(function () {
 function toIsoDate(value) {
 if (!value) return '';
 // If already ISO (YYYY-MM-DD), return as is
 if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
 // If value is Date object, format as ISO
 if (value instanceof Date && !isNaN(value.getTime())) {
 return value.toISOString().slice(0, 10);
 }
 // Try to parse as local date string (e.g. MM/DD/YYYY or DD/MM/YYYY)
 if (typeof value === 'string') {
 // Try to parse as ISO first
 var isoMatch = value.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
 if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
 // Try to parse as DD/MM/YYYY
 var dmyMatch = value.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
 if (dmyMatch) return dmyMatch[3] + '-' + dmyMatch[2] + '-' + dmyMatch[1];
 }
 // Fallback: parse as Date, but beware timezone
 var date = new Date(value);
 if (Number.isNaN(date.getTime())) return '';
 // Use local date, not UTC, to avoid timezone shift
 var yyyy = date.getFullYear();
 var mm = String(date.getMonth() + 1).padStart(2, '0');
 var dd = String(date.getDate()).padStart(2, '0');
 return yyyy + '-' + mm + '-' + dd;
 }

 function parseIsoDate(isoDate) {
 if (!isoDate || typeof isoDate !== 'string') return null;
 var parts = isoDate.split('-');
 if (parts.length !== 3) return null;
 var year = parseInt(parts[0], 10);
 var month = parseInt(parts[1], 10);
 var day = parseInt(parts[2], 10);
 if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
 return new Date(year, month - 1, day);
 }

 function formatIsoDate(date) {
 if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
 var yyyy = date.getFullYear();
 var mm = String(date.getMonth() + 1).padStart(2, '0');
 var dd = String(date.getDate()).padStart(2, '0');
 return yyyy + '-' + mm + '-' + dd;
 }

 function addDaysIso(isoDate, offset) {
 var base = parseIsoDate(isoDate);
 if (!base || !Number.isFinite(offset)) return '';
 base.setDate(base.getDate() + offset);
 return formatIsoDate(base);
 }

 function diffDays(startIso, endIso) {
 var start = parseIsoDate(startIso);
 var end = parseIsoDate(endIso);
 if (!start || !end) return 0;
 return Math.round((end - start) / 86400000);
 }

 function formatDateDisplay(isoDate) {
 if (!isoDate || typeof isoDate !== 'string') return '';
 var date = parseIsoDate(isoDate);
 if (!date) return isoDate;
 var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 var dd = String(date.getDate()).padStart(2, '0');
 var m = monthNames[date.getMonth()] || '';
 var yyyy = date.getFullYear();
 return dd + ' ' + m + ' ' + yyyy;
 }

 function normalizeText(value) {
 return String(value || '').trim();
 }

 function cleanCity(value) {
 return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
 }

 function getHotelMeal(hotel) {
 var mealSources = [
 hotel && hotel.mealType,
 hotel && hotel.serviceType,
 hotel && hotel.mealPlan,
 hotel && hotel.meal,
 hotel && hotel.boardType,
 hotel && hotel.board,
 hotel && hotel.meals
 ];

 if (hotel && Array.isArray(hotel.roomTypes) && hotel.roomTypes.length) {
 mealSources = mealSources.concat(hotel.roomTypes.map(function (rt) { return rt && rt.serviceType; }));
 }

 var merged = mealSources
 .map(function (m) { return normalizeText(m); })
 .filter(Boolean)
 .join(' | ')
 .toLowerCase();

 if (!merged) return 'No Meals';
 if (merged.includes('room only') || merged.includes('no breakfast') || merged.includes('without breakfast') || merged.includes('ro')) return 'No Meals';
 if (merged.includes('full board') || merged.includes('fb') || merged.includes('breakfast lunch dinner')) return 'Full Board';
 if (merged.includes('half board') || merged.includes('hb')) return 'Half Board';
 if (merged.includes('breakfast') || merged.includes('bb') || merged.includes('bed & breakfast') || merged.includes('bed and breakfast')) return 'Breakfast';
 return 'No Meals';
 }

 function getHotelMealLabel(hotel, isCheckInDay, isDepartureDay) {
 if (!hotel) return 'No Meals';
 var baseMeal = getHotelMeal(hotel);
 if (isCheckInDay) {
 if (baseMeal === 'Full Board') return 'Lunch and Dinner';
 if (baseMeal === 'Half Board') return 'Dinner';
 return 'No Meals';
 }
 if (isDepartureDay) {
 // Last day should only show breakfast for any meal plan except Room Only
 if (baseMeal === 'Full Board' || baseMeal === 'Half Board' || baseMeal === 'Breakfast') return 'Breakfast';
 return 'No Meals';
 }

 if (baseMeal === 'Full Board') return 'Breakfast, Lunch and Dinner';
 if (baseMeal === 'Half Board') return 'Breakfast and Dinner';
 if (baseMeal === 'Breakfast') return 'Breakfast';
 return 'No Meals';
 }

 function findHotelForDate(hotels, isoDate) {
 return (hotels || []).find(function (h) {
 var inDate = toIsoDate(h && h.checkIn);
 var outDate = toIsoDate(h && h.checkOut);
 if (!inDate || !outDate) return false;
 return isoDate >= inDate && isoDate < outDate;
 }) || null;
 }

 function findHotelForMealDate(hotels, isoDate) {
 var hotel = findHotelForDate(hotels, isoDate);
 if (hotel) return hotel;
 return (hotels || []).find(function (h) {
 var outDate = toIsoDate(h && h.checkOut);
 return outDate === isoDate;
 }) || null;
 }

 function isAirportLocation(value) {
 return !!String(value || '').toLowerCase().includes('airport');
 }

 function matchesLocation(value, city) {
 return !!String(value || '').toLowerCase().includes(String(city || '').toLowerCase());
 }

 function getTransferMatchValue(transfer, key) {
 if (!transfer) return '';
 if (key === 'from') return normalizeText(transfer.normalizedFrom || transfer.from).toLowerCase();
 if (key === 'to') return normalizeText(transfer.normalizedTo || transfer.to).toLowerCase();
 return '';
 }

 function matchesLocationValue(value, city, hotelName) {
 return matchesLocation(value, city) || matchesLocation(value, hotelName);
 }

 function findTransferByDate(transfers, date, predicate) {
 return (transfers || []).find(function (t) {
 var tDate = toIsoDate(t && t.date);
 return tDate === date && predicate(t);
 }) || null;
 }

 function findTransfersByDate(transfers, date) {
 return (transfers || []).filter(function (t) {
 return toIsoDate(t && t.date) === date;
 });
 }

 function isReturnTransfer(transfer) {
 var direction = normalizeText(transfer && transfer.direction).toLowerCase();
 return direction.includes('return') || direction.includes('round');
 }

 function isHotelChangeTransfer(transfer, fromCity, fromHotel, toCity, toHotel) {
 if (!transfer) return false;
 var fromValue = getTransferMatchValue(transfer, 'from');
 var toValue = getTransferMatchValue(transfer, 'to');
 var fromMatches = matchesLocationValue(fromValue, fromCity, fromHotel) ||
 (fromCity === 'makkah' && fromValue.includes('makkah hotel')) ||
 (fromCity === 'madina' && fromValue.includes('madina hotel'));
 var toMatches = matchesLocationValue(toValue, toCity, toHotel) ||
 (toCity === 'makkah' && toValue.includes('makkah hotel')) ||
 (toCity === 'madina' && toValue.includes('madina hotel'));
 return fromMatches && toMatches;
 }

 function findDirectHotelTransfer(transfers, date, fromCity, fromHotel, toCity, toHotel) {
 return findTransferByDate(transfers, date, function (t) {
 return isHotelChangeTransfer(t, fromCity, fromHotel, toCity, toHotel);
 });
 }

 function getUmrahHotelName(hotels, key) {
 var matcher = key === 'makkah'
 ? function (city) { return city.includes('makk'); }
 : function (city) { return city.includes('madin'); };
 var hotel = (hotels || []).find(function (h) {
 var city = String(h && h.city || '').toLowerCase();
 return matcher(city);
 });
 return hotel && normalizeText(hotel.name) ? normalizeText(hotel.name) : null;
 }

 function mapUmrahLocation(value, hotels) {
 if (!value || typeof value !== 'string') return value;
 var trimmed = normalizeText(value);
 if (/^makkah hotel$/i.test(trimmed)) {
 return getUmrahHotelName(hotels, 'makkah') || trimmed;
 }
 if (/^madina hotel$/i.test(trimmed)) {
 return getUmrahHotelName(hotels, 'madina') || trimmed;
 }
 return trimmed;
 }

 function getTransferLine(transfer) {
 if (!transfer) return '';
 var route = [normalizeText(transfer.from), normalizeText(transfer.to)].filter(Boolean).join(' to ');
 var vehicle = normalizeText(transfer.vehicle || transfer.type);
 var line = 'Transfer: ' + (route || '');
 if (vehicle) line += ' by ' + vehicle;
 return line;
 }

 function getHotelDepartureTransferLine(transfer, isoDate, fromCity, currentHotelName) {
 if (!transfer) return '';
 var tDate = toIsoDate(transfer.date);
 var rDate = toIsoDate(transfer.returnDate);
 var vehicle = normalizeText(transfer.vehicle || transfer.type);
 var fromValue = getTransferMatchValue(transfer, 'from');
 var toValue = getTransferMatchValue(transfer, 'to');

 // If this transfer is a return leg on the hotel-change date, keep the hotel->airport direction.
 if (isReturnTransfer(transfer)) {
 if (tDate === isoDate && matchesLocationValue(fromValue, fromCity, currentHotelName) && isAirportLocation(toValue)) {
 var route = [normalizeText(transfer.from), normalizeText(transfer.to)].filter(Boolean).join(' to ');
 var line = 'Return Transfer: ' + (route || '');
 if (vehicle) line += ' by ' + vehicle;
 return line;
 }
 if (rDate === isoDate && tDate !== isoDate && matchesLocationValue(toValue, fromCity, currentHotelName) && isAirportLocation(fromValue)) {
 var revRoute = [normalizeText(transfer.to), normalizeText(transfer.from)].filter(Boolean).join(' to ');
 var line = 'Return Transfer: ' + (revRoute || '');
 if (vehicle) line += ' by ' + vehicle;
 return line;
 }
 }

 return getTransferLine(transfer);
 }

 function ensureDay(dayMap, isoDate) {
 if (!dayMap[isoDate]) {
 dayMap[isoDate] = { date: isoDate, activities: [], meals: new Set() };
 }
 return dayMap[isoDate];
 }

 function addActivity(dayMap, isoDate, activity) {
 if (!isoDate || !activity) return;
 var day = ensureDay(dayMap, isoDate);
 var exists = day.activities.some(function (a) { return cleanCity(a) === cleanCity(activity); });
 if (!exists) day.activities.push(activity);
 }

 function addMeal(dayMap, isoDate, meal) {
 if (!isoDate || !meal) return;
 var day = ensureDay(dayMap, isoDate);
 day.meals.add(meal);
 }

 function orderDayActivities(activities) {
 if (!Array.isArray(activities) || activities.length <= 1) return activities;

 var hasCheckOut = activities.some(function (a) { return /^check-out/i.test(a); });
 var hasCheckIn = activities.some(function (a) { return /^check-in/i.test(a); });
 var hasTour = activities.some(function (a) { return /^tour:/i.test(a); });
 var hasReturnTransfer = activities.some(function (a) { return /^return transfer:/i.test(a) || (/^transfer:/i.test(a) && /return/i.test(a.toLowerCase())); });
 var hasTransfer = activities.some(function (a) { return /^transfer:/i.test(a); });
 var hasFlight = activities.some(function (a) { return /^flight:/i.test(a); });

 var checkOut = [];
 var checkIn = [];
 var tours = [];
 var returnTransfers = [];
 var transfers = [];
 var flights = [];
 var others = [];

 activities.forEach(function (act) {
 var lower = act.toLowerCase();
 if (/^check-out/i.test(act)) checkOut.push(act);
 else if (/^check-in/i.test(act)) checkIn.push(act);
 else if (/^tour:/i.test(act)) tours.push(act);
 else if (/^return transfer:/i.test(act) || (/^transfer:/i.test(act) && /return/i.test(lower))) returnTransfers.push(act);
 else if (/^flight:/i.test(act)) flights.push(act);
 else if (/^transfer:/i.test(act)) transfers.push(act);
 else others.push(act);
 });

 if (hasCheckOut && hasCheckIn && hasReturnTransfer) {
 return checkOut.concat(tours, returnTransfers, transfers, flights, checkIn, others);
 }

 if (hasCheckIn && hasTour && hasTransfer && !hasCheckOut) {
 return transfers.concat(checkIn, tours, flights, returnTransfers, checkOut, others);
 }

 var priority = function (act) {
 if (/^arrival/i.test(act)) return 10;
 if (/^check-out/i.test(act)) return 20;
 if (/^transfer:/i.test(act) && !/^return transfer:/i.test(act)) return 30;
 if (/^flight:/i.test(act)) return 35;
 if (/^check-in/i.test(act)) return 40;
 if (/^tour:/i.test(act)) return 50;
 if (/^return transfer:/i.test(act)) return 60;
 if (/^departure/i.test(act)) return 70;
 return 80;
 };

 return activities.slice().sort(function (a, b) {
 var pa = priority(a);
 var pb = priority(b);
 if (pa !== pb) return pa - pb;
 return activities.indexOf(a) - activities.indexOf(b);
 });
 }

 function parseFlightInfo(raw) {
 if (!raw) return '';
 var out = [];
 if (raw.flightNumber) out.push(raw.flightNumber);
 var timeRange = [raw.departureTime, raw.arrivalTime].filter(Boolean).join(' to ');
 if (timeRange) out.push(timeRange);
 if (raw.flightDate) out.push(raw.flightDate);
 return out.join(' - ');
 }

 async function generateItinerary(options) {
 var clientData = options.clientData || {};
 var hotels = (options.hotels || []).slice() || [];
 var transfers = options.transfers || [];
 var tours = options.tours || [];
 var flightSegments = Object.assign({}, options.flightSegments || {});
 var dayMap = {};

 var validHotels = hotels
 .filter(function (hotel) { return !!toIsoDate(hotel && hotel.checkIn) && !!toIsoDate(hotel && hotel.checkOut); })
 .sort(function (a, b) {
 return toIsoDate(a.checkIn).localeCompare(toIsoDate(b.checkIn));
 });
 transfers = (transfers || []).map(function (transfer) {
 if (!transfer || typeof transfer !== 'object') return transfer;
 return Object.assign({}, transfer, {
 normalizedFrom: mapUmrahLocation(transfer.from, validHotels),
 normalizedTo: mapUmrahLocation(transfer.to, validHotels)
 });
 });
 var hotelChangeDates = {};
 for (var hIdxCheck = 0; hIdxCheck < validHotels.length - 1; hIdxCheck++) {
 var nextHotelDate = toIsoDate(validHotels[hIdxCheck + 1].checkIn);
 if (nextHotelDate) hotelChangeDates[nextHotelDate] = true;
 }
 var firstHotel = validHotels[0] || null;
 var lastHotel = validHotels.length ? validHotels[validHotels.length - 1] : null;
 var tripStart = firstHotel ? toIsoDate(firstHotel.checkIn) : toIsoDate(clientData.dateFrom);
 var tripEnd = lastHotel ? toIsoDate(lastHotel.checkOut) : toIsoDate(clientData.dateTo);

 if (!tripStart || !tripEnd || tripEnd < tripStart) {
 tripStart = toIsoDate(clientData.dateFrom) || toIsoDate(clientData.dateTo) || toIsoDate(new Date());
 tripEnd = toIsoDate(clientData.dateTo) || tripStart;
 }

 var travelEnd = toIsoDate(clientData.dateTo);
 if (travelEnd && travelEnd > tripEnd) {
 tripEnd = travelEnd;
 }

 // Day 1: Always Arrival on the first actual trip day
 addActivity(dayMap, tripStart, 'Arrival');
 var arrivalTransferIndex = -1;
 if (firstHotel) {
 var arrivalTransfer = transfers.find(function (t, idx) {
 var td = toIsoDate(t && t.date);
 var from = getTransferMatchValue(t, 'from');
 var to = getTransferMatchValue(t, 'to');
 var isAirportRoute = from.includes('airport') || to.includes('airport');
 if (td === tripStart && isAirportRoute) {
 arrivalTransferIndex = idx;
 return true;
 }
 return false;
 }) || null;
 if (arrivalTransfer) {
 arrivalTransfer.__usedForArrival = true;
 addActivity(dayMap, tripStart, getTransferLine(arrivalTransfer));
 } else {
 var cityLabel = normalizeText(firstHotel.city) || normalizeText(clientData.tourDestination) || 'Destination';
 var hotelLabel = normalizeText(firstHotel.name) || 'Hotel';
 addActivity(dayMap, tripStart, 'Transfer: ' + cityLabel + ' Airport to ' + hotelLabel + ' by Vehicle');
 }
 addActivity(dayMap, tripStart, 'Check-in at ' + (normalizeText(firstHotel.name) || 'Hotel'));
 }

 transfers.forEach(function (transfer) {
 var tDate = toIsoDate(transfer && transfer.date);
 if (tDate && !hotelChangeDates[tDate] && !(transfer.__usedForArrival && tDate === tripStart)) {
 var route = [normalizeText(transfer.from), normalizeText(transfer.to)].filter(Boolean).join(' to ');
 var vehicle = normalizeText(transfer.vehicle || transfer.type);
 var line = 'Transfer: ' + (route ? route : '');
 if (vehicle) line += ' by ' + vehicle;
 addActivity(dayMap, tDate, line);
 }
 var rDate = toIsoDate(transfer && transfer.returnDate);
 if (rDate && rDate !== tDate && !hotelChangeDates[rDate] && isReturnTransfer(transfer)) {
 var revRoute = [normalizeText(transfer.to), normalizeText(transfer.from)].filter(Boolean).join(' to ');
 var rVehicle = normalizeText(transfer.vehicle || transfer.type);
 var rLine = 'Return Transfer: ' + (revRoute ? revRoute : '');
 if (rVehicle) rLine += ' by ' + rVehicle;
 addActivity(dayMap, rDate, rLine);
 }
 });

 for (var hIdx = 0; hIdx < validHotels.length - 1; hIdx++) {
 var currentHotel = validHotels[hIdx];
 var nextHotel = validHotels[hIdx + 1];
 var fromCity = normalizeText(currentHotel.city);
 var toCity = normalizeText(nextHotel.city);
 if (!fromCity || !toCity || cleanCity(fromCity) === cleanCity(toCity)) continue;

 var changeDate = toIsoDate(nextHotel.checkIn);
 if (!changeDate) continue;
 var segKey = cleanCity(fromCity) + '__' + cleanCity(toCity) + '__' + changeDate;
 var detail = flightSegments[segKey] || null;

 addActivity(dayMap, changeDate, 'Check-out from ' + (normalizeText(currentHotel.name) || 'Hotel'));

 var directHotelTransfer = findDirectHotelTransfer(
 transfers,
 changeDate,
 fromCity,
 normalizeText(currentHotel.name),
 toCity,
 normalizeText(nextHotel.name)
 );
 if (directHotelTransfer) {
 addActivity(dayMap, changeDate, getTransferLine(directHotelTransfer));
 } else {
 var changeDayTransfers = findTransfersByDate(transfers, changeDate).filter(function (transfer) {
 return isHotelChangeTransfer(transfer, fromCity, normalizeText(currentHotel.name), toCity, normalizeText(nextHotel.name));
 });
 if (changeDayTransfers.length > 0) {
 changeDayTransfers.forEach(function (transfer) {
 addActivity(dayMap, changeDate, getTransferLine(transfer));
 });
 } else {
 var preFlightTransfer = findTransferByDate(transfers, changeDate, function (t) {
 var fromValue = getTransferMatchValue(t, 'from');
 var toValue = getTransferMatchValue(t, 'to');
 return (matchesLocationValue(fromValue, fromCity, normalizeText(currentHotel.name)) && isAirportLocation(toValue)) ||
 (matchesLocationValue(toValue, fromCity, normalizeText(currentHotel.name)) && isAirportLocation(fromValue)) ||
 (toIsoDate(t.returnDate) === changeDate && matchesLocationValue(fromValue, fromCity, normalizeText(currentHotel.name)));
 });
 if (preFlightTransfer) {
 addActivity(dayMap, changeDate, getHotelDepartureTransferLine(preFlightTransfer, changeDate, fromCity, normalizeText(currentHotel.name)));
 } else {
 addActivity(dayMap, changeDate, 'Transfer: ' + (normalizeText(currentHotel.name) || 'Hotel') + ' to ' + fromCity + ' Airport by Sedan');
 }

 var postFlightTransfer = findTransferByDate(transfers, changeDate, function (t) {
 var fromValue = getTransferMatchValue(t, 'from');
 var toValue = getTransferMatchValue(t, 'to');
 return (isAirportLocation(fromValue) && matchesLocationValue(toValue, toCity, normalizeText(nextHotel.name))) ||
 (isAirportLocation(toValue) && matchesLocationValue(fromValue, toCity, normalizeText(nextHotel.name)));
 });
 if (postFlightTransfer) {
 addActivity(dayMap, changeDate, getTransferLine(postFlightTransfer));
 } else {
 addActivity(dayMap, changeDate, 'Transfer: ' + toCity + ' airport to ' + (normalizeText(nextHotel.name) || 'Hotel') + ' by Sedan');
 }
 }
 }

 addActivity(dayMap, changeDate, 'Check-in at ' + (normalizeText(nextHotel.name) || 'Hotel'));
 }

 if (lastHotel && toIsoDate(lastHotel.checkOut) === tripEnd) {
 addActivity(dayMap, tripEnd, 'Check-out from ' + (normalizeText(lastHotel.name) || 'Hotel'));
 }

 if (tripEnd) {
 var day = dayMap[tripEnd] || { activities: [] };
 var hasTransfer = day.activities.some(function (act) {
 return /^transfer:/i.test(act) || /^return transfer:/i.test(act);
 });
 if (!hasTransfer && transfers && transfers.length > 0) {
 var returnTransfer = transfers.find(function (t) {
 var td = toIsoDate(t && t.date);
 return td === tripEnd;
 }) || null;
 if (returnTransfer) {
 addActivity(dayMap, tripEnd, getTransferLine(returnTransfer));
 }
 }
 addActivity(dayMap, tripEnd, 'Departure');
 }

 var tripDates = [];
 var tripTotalDays = diffDays(tripStart, tripEnd);
 for (var d = 0; d <= tripTotalDays; d++) {
 tripDates.push(addDaysIso(tripStart, d));
 }

 tripDates.forEach(function(date) {
 var day = ensureDay(dayMap, date);
 if (!day.activities.length) {
 var hotelOnDate = findHotelForDate(validHotels, date);
 if (hotelOnDate) {
 var hotelName = normalizeText(hotelOnDate.name) || 'Hotel';
 day.activities.push('Free Day / Leisure at ' + hotelName);
 } else {
 day.activities.push('Free Day / Leisure');
 }
 }
 var hotelOnDate = findHotelForMealDate(validHotels, date);
 var isCheckInDay = day.activities.some(function (act) { return /^check-in/i.test(act); });
 var mealLabel = getHotelMealLabel(hotelOnDate, isCheckInDay, date === tripEnd);
 day.meals.add(mealLabel);
 if (!day.meals.size) day.meals.add('No Meals');
 });

 tours.forEach(function (tour) {
 var date = toIsoDate(tour && tour.date);
 if (!date) return;
 var title = normalizeText(tour.name) || 'City Tour';
 var city = normalizeText(tour.city);
 var transport = normalizeText(tour.vehicle || tour.mode);
 var phrase = 'Tour: ' + (city ? (city + ' - ' + title) : title);
 if (transport) phrase += ' by ' + transport;
 addActivity(dayMap, date, phrase);
 });

 var sortedDates = tripDates;
 // Always start from Day 1
 var rows = sortedDates.map(function (date, idx) {
 var item = dayMap[date];
 //Remove 'Free Day' if any other activity exists
 var acts = (item.activities || []).filter(Boolean);
 var freeDayIdx = acts.findIndex(function(a){return a.toLowerCase().startsWith('free day');});
 if (acts.length > 1 && freeDayIdx !== -1) acts.splice(freeDayIdx, 1);
 acts = orderDayActivities(acts);

 // Activities: join with comma and space, not line breaks
 var finalActs = acts.map(function(a){return a.trim();}).filter(Boolean);
 var activityStr = finalActs.join(', ');

 var meals = Array.from(item.meals).filter(Boolean);
 var mealsStr = meals.length ? meals.join(', ') : 'No Meals';

 return {
 day: idx + 1,
 date: date,
 activity: activityStr,
 meals: mealsStr
 };
 });

 return { rows: rows, flightSegments: flightSegments };
 }

 function renderItineraryTable(rows, options) {
 var editable = !!(options && options.editable);
 var tableRows = (rows || []).map(function (row, idx) {
 if (editable) {
 return (
 '<tr>' +
 '<td class="itinerary-day" style="padding:10px 12px;border:1px solid #999;vertical-align:top;white-space:nowrap;">Day ' + row.day + '</td>' +
 '<td class="itinerary-date" data-it-date="' + escapeHtml(row.date) + '" style="padding:10px 12px;border:1px solid #999;vertical-align:top;white-space:nowrap;">' + formatDateDisplay(row.date) + '</td>' +
 '<td class="itinerary-activity it-cell" data-it-row="' + idx + '" data-it-field="activity" tabindex="0" style="padding:10px 12px;border:1px solid #999;vertical-align:top;word-break:break-word;">' + escapeHtml(row.activity) + ' <span class="it-edit-icon"></span></td>' +
 '<td class="itinerary-meals it-cell" data-it-row="' + idx + '" data-it-field="meals" tabindex="0" style="padding:10px 12px;border:1px solid #999;vertical-align:top;word-break:break-word;">' + escapeHtml(row.meals) + ' <span class="it-edit-icon"></span></td>' +
 '</tr>'
 );
 }
 return '' +
 '<tr>' +
 '<td class="itinerary-day" style="padding:10px 12px;border:1px solid #999;vertical-align:top;white-space:nowrap;">Day ' + row.day + '</td>' +
 '<td class="itinerary-date" style="padding:10px 12px;border:1px solid #999;vertical-align:top;white-space:nowrap;">' + formatDateDisplay(row.date) + '</td>' +
 '<td class="itinerary-activity" style="padding:10px 12px;border:1px solid #999;vertical-align:top;word-break:break-word;">' + escapeHtml(row.activity) + '</td>' +
 '<td class="itinerary-meals" style="padding:10px 12px;border:1px solid #999;vertical-align:top;word-break:break-word;">' + escapeHtml(row.meals) + '</td>' +
 '</tr>';
 }).join('');

 return '' +
 '<div class="itinerary-table-wrapper" style="overflow-x:auto;">' +
 '<table class="itinerary-table" style="width:100%;border-collapse:collapse;background:#fff;font-size:13px;margin-top:10px;border:1px solid #999;table-layout:fixed;min-width:0;">' +
 '<colgroup>' +
 '<col style="width:70px;">' +
 '<col style="width:120px;">' +
 '<col style="width:auto;">' +
 '<col style="width:130px;">' +
 '</colgroup>' +
 '<thead><tr style="background:#eef5ff;">' +
 '<th style="padding:10px 12px;border:1px solid #999;text-align:left;vertical-align:top;white-space:nowrap;">Day</th>' +
 '<th style="padding:10px 12px;border:1px solid #999;text-align:left;vertical-align:top;white-space:nowrap;">Date</th>' +
 '<th style="padding:10px 12px;border:1px solid #999;text-align:left;vertical-align:top;">Activity</th>' +
 '<th style="padding:10px 12px;border:1px solid #999;text-align:left;vertical-align:top;">Meals</th>' +
 '</tr></thead>' +
 '<tbody>' + tableRows + '</tbody>' +
 '</table>' +
 '</div>';
 }

 function initEditableItinerary(container) {
 if (!container) return;
 var table = container.querySelector('table');
 if (!table || table.__itineraryEditorInitialized) return;
 table.__itineraryEditorInitialized = true;

 var editing = null;
 function finishEdit(save) {
 if (!editing) return;
 var input = editing.querySelector('input,textarea');
 var value = input ? input.value : '';
 var field = editing.getAttribute('data-it-field');
 if (save && input) {
 editing.innerHTML = value + ' <span class="it-edit-icon" style="opacity:0.4;margin-left:4px;"></span>';
 } else {
 var prev = editing.getAttribute('data-prev-value') || '';
 editing.innerHTML = prev + ' <span class="it-edit-icon" style="opacity:0.4;margin-left:4px;"></span>';
 }
 editing = null;
 }

 table.addEventListener('click', function(e) {
 var cell = e.target.closest('.it-cell');
 if (!cell || editing === cell) return;
 if (editing) finishEdit(true);
 var field = cell.getAttribute('data-it-field');
 if (field !== 'activity' && field !== 'meals') return;
 var value = cell.textContent.replace(//g,'').trim();
 cell.setAttribute('data-prev-value', value);
 var input = '';
 if (field === 'activity') input = '<textarea style="width:98%;min-height:48px;padding:4px;border:1px solid #ccd;">'+value+'</textarea>';
 else input = '<input type="text" value="'+value+'" style="width:98%;padding:4px;border:1px solid #ccd;" />';
 cell.innerHTML = input;
 var inp = cell.querySelector('input,textarea');
 if (inp) {
 inp.focus();
 inp.select();
 inp.addEventListener('keydown', function(ev) {
 if (ev.key === 'Enter' && field !== 'activity') finishEdit(true);
 if (ev.key === 'Escape') finishEdit(false);
 });
 inp.addEventListener('blur', function() { finishEdit(true); });
 }
 editing = cell;
 });
 }

 function readEditableRows(container) {
 if (!container) return [];
 var rows = [];
 var dayInputs = container.querySelectorAll('input[data-it-field="day"]');
 if (dayInputs.length) {
 dayInputs.forEach(function (input) {
 var idx = input.getAttribute('data-it-row');
 var get = function (field) {
 return container.querySelector('input[data-it-field="' + field + '"][data-it-row="' + idx + '"]');
 };
 rows.push({
 day: parseInt(input.value || '0', 10) || rows.length + 1,
 date: toIsoDate((get('date') || {}).value || ''),
 activity: normalizeText((get('activity') || {}).value || ''),
 meals: normalizeText((get('meals') || {}).value || '') || 'No Meals'
 });
 });
 } else {
 var rowElements = container.querySelectorAll('table tbody tr');
 rowElements.forEach(function (tr, idx) {
 var cells = tr.querySelectorAll('td');
 if (cells.length < 4) return;
 var dateText = cells[1].getAttribute('data-it-date') || cells[1].textContent.replace(//g, '').trim();
 var activityText = cells[2].textContent.replace(//g, '').trim();
 var mealsText = cells[3].textContent.replace(//g, '').trim();
 rows.push({
 day: idx + 1,
 date: toIsoDate(dateText),
 activity: normalizeText(activityText),
 meals: normalizeText(mealsText) || 'No Meals'
 });
 });
 }

 rows = rows
 .filter(function (r) { return r.date; })
 .sort(function (a, b) { return a.date.localeCompare(b.date); })
 .map(function (r, i) {
 return {
 day: r.day || (i + 1),
 date: r.date,
 activity: r.activity || 'Free Day / Leisure',
 meals: r.meals || 'No Meals'
 };
 });

 rows = rows
 .filter(function (r) { return r.date; })
 .sort(function (a, b) { return a.date.localeCompare(b.date); })
 .map(function (r, i) {
 return {
 day: r.day || (i + 1),
 date: r.date,
 activity: r.activity || 'Free Day / Leisure',
 meals: r.meals || 'No Meals'
 };
 });

 rows.forEach(function (r, i) { r.day = i + 1; });
 return rows;
 }

 function escapeHtml(value) {
 var div = document.createElement('div');
 div.textContent = String(value || '');
 return div.innerHTML;
 }

 window.ItineraryComponent = {
 toIsoDate: toIsoDate,
 formatDateDisplay: formatDateDisplay,
 generateItinerary: generateItinerary,
 renderItineraryTable: renderItineraryTable,
 readEditableRows: readEditableRows,
 initEditableItinerary: initEditableItinerary
 };
})();
