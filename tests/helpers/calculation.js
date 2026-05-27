const DEFAULT_RATES = Object.freeze({
  PKR: 1,
  SAR: 74,
  USD: 280,
  EUR: 305,
  GBP: 355,
  AED: 76
});

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toPKR(amount, currency = 'PKR', rates = DEFAULT_RATES) {
  const rate = rates[currency] || 1;
  return roundMoney((Number(amount) || 0) * rate);
}

function passengerTotals({
  pax,
  flight = {},
  hotel = {},
  visa = {},
  transfer = {},
  transport = {},
  transportSharingApplicable = true,
  rates = DEFAULT_RATES
}) {
  const adults = Number(pax.adults || 0);
  const childBed = Number(pax.childBed || 0);
  const childNoBed = Number(pax.childNoBed || 0);
  const infants = Number(pax.infants || 0);
  const serviceTotal = service => toPKR((service.cost || 0) + (service.service || 0), service.currency || 'PKR', rates);

  const flightTotal = serviceTotal(flight);
  const hotelTotal = serviceTotal(hotel);
  const visaTotal = serviceTotal(visa);
  const transferTotal = serviceTotal(transfer);
  const transportTotal = transportSharingApplicable ? serviceTotal(transport) : 0;

  const adult = flightTotal + hotelTotal + visaTotal + transferTotal + transportTotal;
  const childWithBed = flightTotal + hotelTotal + visaTotal + transportTotal;
  const childNoBedTotal = flightTotal + visaTotal + transportTotal;
  const infant = flightTotal + visaTotal;

  return {
    adult: roundMoney(adult),
    childWithBed: roundMoney(childWithBed),
    childNoBed: roundMoney(childNoBedTotal),
    infant: roundMoney(infant),
    grandTotal: roundMoney((adult * adults) + (childWithBed * childBed) + (childNoBedTotal * childNoBed) + (infant * infants))
  };
}

function actualRoomTotal(rooms, currency = 'PKR', rates = DEFAULT_RATES) {
  return roundMoney((rooms || []).reduce((sum, room) => {
    const amount = (Number(room.costPerNight || 0) + Number(room.servicePerNight || 0)) * Number(room.nights || 0) * Number(room.count || 1);
    return sum + toPKR(amount, room.currency || currency, rates);
  }, 0));
}

function averageRoomPerPerson(rooms, payingPax, currency = 'PKR', rates = DEFAULT_RATES) {
  const total = actualRoomTotal(rooms, currency, rates);
  return payingPax > 0 ? roundMoney(total / payingPax) : 0;
}

module.exports = {
  DEFAULT_RATES,
  roundMoney,
  toPKR,
  passengerTotals,
  actualRoomTotal,
  averageRoomPerPerson
};
