import React from 'react';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';

import { FlipHorizontalIcon } from '../svg';

// Helper to clear overlays for a specific feature
function clearPolygonOverlays(feature, mapRef) {
  if (feature && feature._segmentOverlays) {
    feature._segmentOverlays.forEach(overlay => {
      if (mapRef.current) mapRef.current.removeOverlay(overlay);
    });
    feature._segmentOverlays = [];
  }
}

// Flip horizontally and remark segments/lines
function flipFeatureHorizontally(feature, mapRef) {
  clearPolygonOverlays(feature, mapRef);
  const geom = feature.getGeometry();
  let coords, xs, axis, flipped;

  if (geom instanceof Polygon) {
    coords = geom.getCoordinates()[0];
    xs = coords.map(c => c[0]);
    axis = (Math.min(...xs) + Math.max(...xs)) / 2;
    flipped = coords.map(([x, y]) => [axis - (x - axis), y]);
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
    xs = coords.map(c => c[0]);
    axis = (Math.min(...xs) + Math.max(...xs)) / 2;
    flipped = coords.map(([x, y]) => [axis - (x - axis), y]);
    geom.setCoordinates(flipped);
    // Remark line segments
    if (mapRef.current && mapRef.current.createSegmentOverlays) {
      mapRef.current.createSegmentOverlays(feature, mapRef);
    }
    return { prevCoords: coords, newCoords: flipped };
  }
  return null;
}

export default function FlipHorizButton({ selectedFeature, mapRef, addHistoryAction }) {
  function handleFlipHoriz() {
    if (selectedFeature) {
      const geom = selectedFeature.getGeometry();
      let prevCoords;
      if (geom instanceof Polygon) {
        prevCoords = geom.getCoordinates()[0].map(c => [...c]);
      } else if (geom instanceof LineString) {
        prevCoords = geom.getCoordinates().map(c => [...c]);
      }
      const result = flipFeatureHorizontally(selectedFeature, mapRef);
      if (result && addHistoryAction) {
        addHistoryAction({
          type: 'flip-horizontal',
          featureId: selectedFeature.getId && selectedFeature.getId(),
          prevCoords: prevCoords,
          newCoords: result.newCoords,
        });
      }
    }
  }
  return (
    <button
      title="Flip Horizontal"
      className="map-button"
      onClick={handleFlipHoriz}
      disabled={!selectedFeature}
    >
      <FlipHorizontalIcon />
    </button>
  );
}