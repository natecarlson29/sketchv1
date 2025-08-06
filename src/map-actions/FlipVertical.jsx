import React from 'react';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';

import { FlipVerticalIcon } from '../svg';

// Helper to clear overlays for a specific feature
function clearPolygonOverlays(feature, mapRef) {
  if (feature && feature._segmentOverlays) {
    feature._segmentOverlays.forEach(overlay => {
      if (mapRef.current) mapRef.current.removeOverlay(overlay);
    });
    feature._segmentOverlays = [];
  }
}

// Flip vertically and remark segments/lines
function flipFeatureVertically(feature, mapRef) {
  clearPolygonOverlays(feature, mapRef);
  const geom = feature.getGeometry();
  let coords, ys, axis, flipped;

  if (geom instanceof Polygon) {
    coords = geom.getCoordinates()[0];
    ys = coords.map(c => c[1]);
    axis = (Math.min(...ys) + Math.max(...ys)) / 2;
    flipped = coords.map(([x, y]) => [x, axis - (y - axis)]);
    // Ensure closed ring for polygons
    if (
      flipped.length > 1 &&
      (flipped[0][0] !== flipped[flipped.length - 1][0] ||
        flipped[0][1] !== flipped[flipped.length - 1][1])
    ) {
      flipped[flipped.length - 1] = [...flipped[0]];
    }
    geom.setCoordinates([flipped]);
    // Remark polygon segments
    if (mapRef.current && mapRef.current.createSegmentOverlays) {
      mapRef.current.createSegmentOverlays(feature, mapRef);
    }
    return { prevCoords: coords, newCoords: flipped };
  } else if (geom instanceof LineString) {
    coords = geom.getCoordinates();
    ys = coords.map(c => c[1]);
    axis = (Math.min(...ys) + Math.max(...ys)) / 2;
    flipped = coords.map(([x, y]) => [x, axis - (y - axis)]);
    geom.setCoordinates(flipped);
    // Remark line segments
    if (mapRef.current && mapRef.current.createSegmentOverlays) {
      mapRef.current.createSegmentOverlays(feature, mapRef);
    }
    return { prevCoords: coords, newCoords: flipped };
  }
  return null;
}

export default function FlipVertButton({ selectedFeature, mapRef, addHistoryAction }) {
  function handleFlipVert() {
    if (selectedFeature) {
      const geom = selectedFeature.getGeometry();
      let prevCoords;
      if (geom instanceof Polygon) {
        prevCoords = geom.getCoordinates()[0].map(c => [...c]);
      } else if (geom instanceof LineString) {
        prevCoords = geom.getCoordinates().map(c => [...c]);
      }
      const result = flipFeatureVertically(selectedFeature, mapRef);
      if (result && addHistoryAction) {
        addHistoryAction({
          type: 'flip-vertical',
          featureId: selectedFeature.getId && selectedFeature.getId(),
          prevCoords: prevCoords,
          newCoords: result.newCoords,
        });
      }
    }
  }
  return (
    <button
      title="Flip Vertical"
      className="map-button"
      onClick={handleFlipVert}
      disabled={!selectedFeature}
    >
      <FlipVerticalIcon />
    </button>
  );
}