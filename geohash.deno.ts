// The authors disclaim copyright to this source code (they are ashamed to
// admit they wrote it)

import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";
import { coordsToString } from "./mapycz.deno.ts";

const djiaCache = new Map<string, Promise<string>>();
async function getDjiaFor(key: string) {
  const stored = djiaCache.get(key);
  if (stored) return await stored;

  let resolve = (x: string) => {};
  let reject = (x: string) => {};
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  djiaCache.set(key, promise);

  const resp = await fetch(`http://geo.crox.net/djia/${key}`);

  if (!resp.ok) reject("Failed to fetch DJIA");
  else resolve(await resp.text());

  return await promise;
}

async function hash(seed: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("MD5", new TextEncoder().encode(seed)),
  );
  let lat = 0;
  for (let i = 0; i < 8; i++) {
    lat += digest[i] / 256 ** (i + 1);
  }

  let lon = 0;
  for (let i = 8; i < 16; i++) {
    lon += digest[i] / 256 ** (i - 7);
  }
  return { lat, lon };
}

export async function geohash(
  date: Date,
  base_loc: { lat: number; lon: number },
) {
  const seedDatepart = date.toISOString().slice(0, 10);

  if (base_loc.lon > -30) date.setDate(date.getDate() - 1);
  const djia = await getDjiaFor(date.toISOString().slice(0, 10));
  const { lat, lon } = await hash(`${seedDatepart}-${djia}`);

  let res_lat = Math.floor(Math.abs(base_loc.lat)) + lat;
  if (base_loc.lat < 0) res_lat *= -1;

  let res_lon = Math.floor(Math.abs(base_loc.lon)) + lon;
  if (base_loc.lon < 0) res_lon *= -1;

  return { lat: res_lat, lon: res_lon };
}
