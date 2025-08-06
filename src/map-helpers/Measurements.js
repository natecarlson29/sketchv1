import LineString from 'ol/geom/LineString';
import Overlay from 'ol/Overlay';

// Format length in feet or miles
export function formatLength(line) {
  const lengthMeters = line.getLength ? line.getLength() : 0;
  const lengthFeet = lengthMeters * 3.28084;
  return lengthFeet > 5280
    ? (lengthFeet / 5280).toFixed(2) + ' mi'
    : lengthFeet.toFixed(2) + "'";
}

// Remove all overlays for a feature (Polygon or LineString)
export function clearPolygonOverlays(feature, mapRef) {
  if (feature && feature._segmentOverlays) {
    feature._segmentOverlays.forEach(overlay => {
      if (mapRef && mapRef.current) mapRef.current.removeOverlay(overlay);
    });
    feature._segmentOverlays = [];
  }
}

export function createSegmentOverlays(feature, mapRef) {
  if (feature.get('no-measurements')) return;
  clearPolygonOverlays(feature, mapRef);
  const DIM_OFFSET = 17;
  feature._segmentOverlays = [];

  const geom = feature.getGeometry();
  const geomType = geom.getType();
  let points;

  if (geomType === 'Polygon') {
    points = geom.getCoordinates()[0];
  } else if (geomType === 'LineString') {
    points = geom.getCoordinates();
  } else {
    return;
  }

  // --- Segment Length Overlays ---
  for (let i = 1; i < points.length; i++) {
    const c1 = points[i - 1];
    const c2 = points[i];
    const line = new LineString([c1, c2]);
    const length = formatLength(line);

    // Calculate perpendicular offset direction (in screen pixels)
    const pixel1 = mapRef.current.getPixelFromCoordinate(c1);
    const pixel2 = mapRef.current.getPixelFromCoordinate(c2);
    const dx = pixel2[0] - pixel1[0];
    const dy = pixel2[1] - pixel1[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const perp = len === 0 ? [0, 0] : [(dy / len), -(dx / len)];

    // Offset midpoint in screen pixels
    const offsetMidPixel = [
      (pixel1[0] + pixel2[0]) / 2 + perp[0] * DIM_OFFSET,
      (pixel1[1] + pixel2[1]) / 2 + perp[1] * DIM_OFFSET,
    ];
    const offsetMidCoord = mapRef.current.getCoordinateFromPixel(offsetMidPixel);

    // Place the tooltip at the offset position
    const tooltip = document.createElement('div');
    tooltip.className = 'segment-tooltip';
    tooltip.innerHTML = length;
    tooltip.style.transform = 'none';

    const overlay = new Overlay({
      element: tooltip,
      position: offsetMidCoord,
      positioning: 'center-center',
      stopEvent: false,
    });
    mapRef.current.addOverlay(overlay);
    feature._segmentOverlays.push(overlay);
  }

  // --- Vertex Angle Overlays ---
  const isPolygon = geomType === 'Polygon';
  const n = points.length;
  if (isPolygon) {
    // For polygons, skip the last point (duplicate of the first)
    for (let i = 0; i < n - 1; i++) {
      const prev = points[(i - 1 + n - 1) % (n - 1)];
      const curr = points[i];
      const next = points[(i + 1) % (n - 1)];

      const angle = getVertexAngle(prev, curr, next);
      if (angle === null || isNaN(angle) || Math.abs(angle - 90) < 0.01 || Math.abs(angle - 180) < 0.01) continue;

      const pixelCurr = mapRef.current.getPixelFromCoordinate(curr);
      const pixelPrev = mapRef.current.getPixelFromCoordinate(prev);
      const pixelNext = mapRef.current.getPixelFromCoordinate(next);

      // Bisector direction for offset
      const bisector = [
        (pixelPrev[0] - pixelCurr[0]) + (pixelNext[0] - pixelCurr[0]),
        (pixelPrev[1] - pixelCurr[1]) + (pixelNext[1] - pixelCurr[1])
      ];
      const bisLen = Math.sqrt(bisector[0] * bisector[0] + bisector[1] * bisector[1]) || 1;
      const offsetPixel = [
        pixelCurr[0] + (bisector[0] / bisLen) * (DIM_OFFSET * 0.8),
        pixelCurr[1] + (bisector[1] / bisLen) * (DIM_OFFSET * 0.8)
      ];
      const offsetCoord = mapRef.current.getCoordinateFromPixel(offsetPixel);

      const angleTooltip = document.createElement('div');
      angleTooltip.className = 'segment-tooltip angle-tooltip';
      angleTooltip.innerHTML = `${angle.toFixed(1)}°`;
      angleTooltip.style.transform = 'none';

      const angleOverlay = new Overlay({
        element: angleTooltip,
        position: offsetCoord,
        positioning: 'center-center',
        stopEvent: false,
      });
      mapRef.current.addOverlay(angleOverlay);
      feature._segmentOverlays.push(angleOverlay);
    }
  } else {
    // For lines, show angle at each interior vertex (not endpoints)
    for (let i = 1; i < n - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const angle = getVertexAngle(prev, curr, next);
      if (angle === null || isNaN(angle) || Math.abs(angle - 90) < 0.01 || Math.abs(angle - 180) < 0.01) continue;

      const pixelCurr = mapRef.current.getPixelFromCoordinate(curr);
      const pixelPrev = mapRef.current.getPixelFromCoordinate(prev);
      const pixelNext = mapRef.current.getPixelFromCoordinate(next);

      const bisector = [
        (pixelPrev[0] - pixelCurr[0]) + (pixelNext[0] - pixelCurr[0]),
        (pixelPrev[1] - pixelCurr[1]) + (pixelNext[1] - pixelCurr[1])
      ];
      const bisLen = Math.sqrt(bisector[0] * bisector[0] + bisector[1] * bisector[1]) || 1;
      const offsetPixel = [
        pixelCurr[0] + (bisector[0] / bisLen) * (DIM_OFFSET * 0.8),
        pixelCurr[1] + (bisector[1] / bisLen) * (DIM_OFFSET * 0.8)
      ];
      const offsetCoord = mapRef.current.getCoordinateFromPixel(offsetPixel);

      const angleTooltip = document.createElement('div');
      angleTooltip.className = 'segment-tooltip angle-tooltip';
      angleTooltip.innerHTML = `${angle.toFixed(1)}°`;
      angleTooltip.style.transform = 'none';

      const angleOverlay = new Overlay({
        element: angleTooltip,
        position: offsetCoord,
        positioning: 'center-center',
        stopEvent: false,
      });
      mapRef.current.addOverlay(angleOverlay);
      feature._segmentOverlays.push(angleOverlay);
    }
  }
}

// Helper to calculate the angle at a vertex (in degrees)
function getVertexAngle(prev, curr, next) {
  if (!prev || !curr || !next) return null;
  const v1 = [prev[0] - curr[0], prev[1] - curr[1]];
  const v2 = [next[0] - curr[0], next[1] - curr[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
  const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
  if (len1 === 0 || len2 === 0) return null;
  let angleRad = Math.acos(dot / (len1 * len2));
  return (angleRad * 180) / Math.PI;
}

// Calculate distance from a point to a line segment defined by two points
export function pointToSegmentDistance(p, p1, p2) {
  const x = p[0], y = p[1];
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// createSegmentOverlays (no angles)
// export function createSegmentOverlays(feature, mapRef) {
//   clearPolygonOverlays(feature, mapRef);
//   const DIM_OFFSET = 17;
//   feature._segmentOverlays = [];

//   const geom = feature.getGeometry();
//   const geomType = geom.getType();
//   let points;

//   if (geomType === 'Polygon') {
//     points = geom.getCoordinates()[0];
//   } else if (geomType === 'LineString') {
//     points = geom.getCoordinates();
//   } else {
//     return;
//   }

//   for (let i = 1; i < points.length; i++) {
//     const c1 = points[i - 1];
//     const c2 = points[i];
//     const line = new LineString([c1, c2]);
//     const length = formatLength(line);

//     // Calculate perpendicular offset direction (in screen pixels)
//     const pixel1 = mapRef.current.getPixelFromCoordinate(c1);
//     const pixel2 = mapRef.current.getPixelFromCoordinate(c2);
//     const dx = pixel2[0] - pixel1[0];
//     const dy = pixel2[1] - pixel1[1];
//     const len = Math.sqrt(dx * dx + dy * dy);
//     const perp = len === 0 ? [0, 0] : [(dy / len), -(dx / len)];

//     // Offset midpoint in screen pixels
//     const offsetMidPixel = [
//       (pixel1[0] + pixel2[0]) / 2 + perp[0] * DIM_OFFSET,
//       (pixel1[1] + pixel2[1]) / 2 + perp[1] * DIM_OFFSET,
//     ];
//     const offsetMidCoord = mapRef.current.getCoordinateFromPixel(offsetMidPixel);

//     // Place the tooltip at the offset position
//     const tooltip = document.createElement('div');
//     tooltip.className = 'segment-tooltip';
//     tooltip.innerHTML = length;

//     // Always keep the tooltip horizontal, regardless of map rotation
//     tooltip.style.transform = 'none';

//     const overlay = new Overlay({
//       element: tooltip,
//       position: offsetMidCoord,
//       positioning: 'center-center',
//       stopEvent: false,
//     });
//     mapRef.current.addOverlay(overlay);
//     feature._segmentOverlays.push(overlay);
//   }
// }
