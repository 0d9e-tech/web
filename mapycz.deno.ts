const alphabet = [
  "0",
  "A",
  "B",
  "C",
  "D",
  "2",
  "E",
  "F",
  "G",
  "H",
  "4",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "6",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "8",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "-",
  "1",
  "a",
  "b",
  "c",
  "d",
  "3",
  "e",
  "f",
  "g",
  "h",
  "5",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "7",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "9",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
  ".",
];

function serializeNumber(delta: number, orig: number) {
  let code = "";
  if (delta >= -1024 && delta < 1024) {
    code += alphabet[(delta + 1024) >> 6];
    code += alphabet[(delta + 1024) & 63];
  } else if (delta >= -32768 && delta < 32768) {
    const value = 131072 | (delta + 32768);
    code += alphabet[(value >> 12) & 63];
    code += alphabet[(value >> 6) & 63];
    code += alphabet[value & 63];
  } else {
    const value = 805306368 | (orig & 268435455);
    code += alphabet[(value >> 24) & 63];
    code += alphabet[(value >> 18) & 63];
    code += alphabet[(value >> 12) & 63];
    code += alphabet[(value >> 6) & 63];
    code += alphabet[value & 63];
  }
  return code;
}

function coordsToString(coords: { lat: number; lon: number }[]): string {
  let ox = 0;
  let oy = 0;
  let result = "";
  for (const { lat, lon } of coords) {
    const x = Math.round(((lon + 180) * (1 << 28)) / 360);
    const y = Math.round(((lat + 90) * (1 << 28)) / 180);
    const dx = x - ox;
    const dy = y - oy;
    result += serializeNumber(dx, x);
    result += serializeNumber(dy, y);
    ox = x;
    oy = y;
  }
  return result;
}

export function getUrlForPoints(points: { lat: number; lon: number }[]) {
  return `https://en.mapy.cz/zakladni?vlastni-body&uc=${coordsToString(
    points
  )}`;
}

export function getImageForPoints(points: { lat: number; lon: number }[]) {
  return (
    `https://en.mapy.cz/screenshoter?` +
    new URLSearchParams({
      url: getUrlForPoints(points) + "&p=3&l=0",
      width: "1200",
      height: "630",
    }).toString()
  );
}
