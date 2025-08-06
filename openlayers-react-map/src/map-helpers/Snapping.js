/**
 * Checks if two coordinates are equal.
 */
export function coordsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Finds the closest coordinate in all features to the pointerPixel within a tolerance.
 */
export function getSnappedCoordinate(map, vectorSource, pointerPixel, tolerance = 25) {
  let closestCoord = null;
  let minDist = Infinity;

  vectorSource.getFeatures().forEach(feature => {
    const geom = feature.getGeometry();
    let coords = [];
    if (geom.getType() === 'Polygon') {
      coords = geom.getCoordinates()[0];
    } else if (geom.getType() === 'LineString') {
      coords = geom.getCoordinates();
    }
    coords.forEach(coord => {
      const pixel = map.getPixelFromCoordinate(coord);
      const dist = Math.hypot(pointerPixel[0] - pixel[0], pointerPixel[1] - pixel[1]);
      if (dist < minDist && dist < tolerance) {
        minDist = dist;
        closestCoord = coord;
      }
    });
  });

  return closestCoord;
}

/**
 * Custom snapping for translate interaction.
 * Only snaps the entire feature to other feature edges (not vertices).
 * Keeps the geometry rigid.
 */
export function customSnapFeature(feature, vectorSource, map, tolerance = 10) {
  const geom = feature.getGeometry();
  if (!geom) return;

  // Get all other features
  const otherFeatures = vectorSource.getFeatures().filter(f => f !== feature);

  // Get all vertices of the moving feature
  let coords = [];
  if (geom.getType() === 'Polygon') {
    coords = geom.getCoordinates()[0];
  } else if (geom.getType() === 'LineString') {
    coords = geom.getCoordinates();
  }

  let snapOffset = null;

  // For each vertex in the moving feature
  for (let i = 0; i < coords.length; i++) {
    const vertex = coords[i];
    const vertexPixel = map.getPixelFromCoordinate(vertex);

    for (const other of otherFeatures) {
      const otherGeom = other.getGeometry();
      let otherCoords = [];
      if (otherGeom.getType() === 'Polygon') {
        otherCoords = otherGeom.getCoordinates()[0];
      } else if (otherGeom.getType() === 'LineString') {
        otherCoords = otherGeom.getCoordinates();
      }

      // Snap only to edges (not vertices)
      for (let j = 0; j < otherCoords.length - 1; j++) {
        const segStart = otherCoords[j];
        const segEnd = otherCoords[j + 1];
        // Project vertex onto segment
        const snapped = snapPointToSegment(vertex, segStart, segEnd);
        const snappedPixel = map.getPixelFromCoordinate(snapped);
        const dist = Math.hypot(vertexPixel[0] - snappedPixel[0], vertexPixel[1] - snappedPixel[1]);
        if (dist < tolerance) {
          // Calculate offset needed to snap the whole feature
          snapOffset = [snapped[0] - vertex[0], snapped[1] - vertex[1]];
          break;
        }
      }
      if (snapOffset) break;
    }
    if (snapOffset) break;
  }

  // If a snap is needed, move the entire feature by the offset
  if (snapOffset) {
    const newCoords = coords.map(([x, y]) => [x + snapOffset[0], y + snapOffset[1]]);
    if (geom.getType() === 'Polygon') {
      geom.setCoordinates([newCoords]);
    } else if (geom.getType() === 'LineString') {
      geom.setCoordinates(newCoords);
    }
  }
}

/**
 * Projects a point onto a segment and returns the closest point on the segment.
 */
export function snapPointToSegment(pt, segA, segB) {
  const [x, y] = pt;
  const [x1, y1] = segA;
  const [x2, y2] = segB;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return segA.slice();
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  if (t < 0) return segA.slice();
  if (t > 1) return segB.slice();
  return [x1 + t * dx, y1 + t * dy];
}