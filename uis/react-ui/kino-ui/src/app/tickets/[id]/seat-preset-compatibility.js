export function seatPresetCompatibility(seatCodes, seats) {
  const seatsByCode = new Map(seats.map((seat) => [seat.code, seat]));
  const missingSeatCode = seatCodes.find((seatCode) => !seatsByCode.has(seatCode));
  if (missingSeatCode) {
    return {
      compatible: false,
      message: `Seat ${missingSeatCode} is not part of this seating map.`,
    };
  }
  const unavailableSeatCode = seatCodes.find(
    (seatCode) => seatsByCode.get(seatCode).status !== 'AVAILABLE'
  );
  if (unavailableSeatCode) {
    return {
      compatible: false,
      message: `Seat ${unavailableSeatCode} is no longer available.`,
    };
  }
  return { compatible: true };
}
