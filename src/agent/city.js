// A small model of moving around Basel: walking with a detour factor, or tram when it's far.
export const places = {
  "basel-sbb": { name: "Basel SBB", geo: { lat: 47.5476, lon: 7.5897 } },
  "badischer-bahnhof": { name: "Basel Badischer Bahnhof", geo: { lat: 47.5672, lon: 7.6075 } },
  "euroairport": { name: "EuroAirport (bus 50 to Basel SBB)", geo: { lat: 47.5476, lon: 7.5897 }, extraMinutes: 20 },
  "rhine-walk": { name: "Rhine promenade at Mittlere Brücke", geo: { lat: 47.5603, lon: 7.5893 } },
};

export function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Expected leg: walk if under ~15 minutes, otherwise tram (incl. average wait). */
export function leg(from, to) {
  const km = distanceKm(from, to) * 1.3; // streets are not straight lines
  const walk = Math.max(2, Math.round((km / 4.8) * 60));
  if (walk <= 15) return { mode: "walk", minutes: walk, km: +km.toFixed(2), fare: 0 };
  const tram = Math.round((km / 14) * 60 + 4 /* wait */ + 4 /* to and from stops */);
  return { mode: "tram", minutes: Math.min(tram, walk), km: +km.toFixed(2), fare: 4.7 };
}
