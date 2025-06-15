export function getUrlForPoint({
  center,
  point,
  zoom,
}: {
  center: LatLon;
  point: LatLon;
  zoom: number;
}) {
  return (
    "https://mapy.com/en/turisticka?" +
    new URLSearchParams({
      q: `${point.lat}N, ${point.lon}E`,
      source: "coor",
      id: `${point.lon},${point.lat}`,
      ds: "1",
      x: center.lon.toString(),
      y: center.lat.toString(),
      z: zoom.toString(),
    }).toString()
  );
}

type LatLon = {
  lat: number;
  lon: number;
};

export function getImageForPoint(meta: {
  center: LatLon;
  point: LatLon;
  zoom: number;
}) {
  return (
    `https://mapy.com/screenshoter?` +
    new URLSearchParams({
      url: getUrlForPoint(meta) + "&p=3&l=0",
      width: "1200",
      height: "630",
    }).toString()
  );
}

function Deg2Rad(degrees: number) {
  return degrees * (Math.PI / 180);
}
function Rad2Deg(radians: number) {
  return radians * (180 / Math.PI);
}

// disownered from https://gis.stackexchange.com/a/19652/175029
export function zoomForPoints(mapArea: {
  MinY: number;
  MinX: number;
  MaxY: number;
  MaxX: number;
}): { center: LatLon; zoom: number } {
  const ry1 = Math.log(
    (Math.sin(Deg2Rad(mapArea.MinY)) + 1) / Math.cos(Deg2Rad(mapArea.MinY)),
  );
  const ry2 = Math.log(
    (Math.sin(Deg2Rad(mapArea.MaxY)) + 1) / Math.cos(Deg2Rad(mapArea.MaxY)),
  );
  const ryc = (ry1 + ry2) / 2;
  const centerY = Rad2Deg(Math.atan(Math.sinh(ryc)));

  // Calculate the horizontal resolution
  const resolutionHorizontal = (mapArea.MaxX - mapArea.MinX) / 1200;

  // Calculate the vertical resolution
  const vy0 = Math.log(Math.tan(Math.PI * (0.25 + centerY / 360)));
  const vy1 = Math.log(Math.tan(Math.PI * (0.25 + mapArea.MaxY / 360)));
  const viewHeightHalf = 630 / 2.0;
  const zoomFactorPowered = viewHeightHalf / (40.7436654315252 * (vy1 - vy0));
  const resolutionVertical = 360.0 / (zoomFactorPowered * 256);

  // Determine the final resolution and zoom level
  const resolution = Math.max(resolutionHorizontal, resolutionVertical) * 1.8;
  const zoom = Math.log2(360 / (resolution * 256)); // Math.log2 is equivalent to Log with base 2
  const lon = (mapArea.MinX + mapArea.MaxX) / 2.0;
  const lat = centerY;

  return {
    center: { lat, lon },
    zoom: Math.round(zoom),
  };
}
