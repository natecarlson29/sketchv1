import React from 'react';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import { CloneIcon } from "../svg";

const Clone = ({ selectedFeature, vectorSourceRef, setSelectedFeature, addHistoryAction, mapRef }) => {
  const handleClone = () => {
    if (!selectedFeature) return;

    const geom = selectedFeature.getGeometry();
    let coords, width = 0, newCoords;

    if (geom.getType() === 'Polygon') {
      coords = geom.getCoordinates()[0];
      // Calculate width as the difference between max and min x
      const xs = coords.map(c => c[0]);
      width = Math.max(...xs) - Math.min(...xs);
      // Offset all x by width
      newCoords = [coords.map(([x, y]) => [x + width, y])];
      const newFeature = new Feature(new Polygon(newCoords));
      newFeature.setId(Date.now().toString());
      vectorSourceRef.current.addFeature(newFeature);
      mapRef.current.createSegmentOverlays(newFeature, mapRef);
      addHistoryAction({
        type: 'clone-feature',
        featureId: newFeature.getId(),
        prevCoords: [],
        newCoords: newCoords,
      });
    } else if (geom.getType() === 'LineString') {
      coords = geom.getCoordinates();
      const xs = coords.map(c => c[0]);
      width = Math.max(...xs) - Math.min(...xs);
      newCoords = coords.map(([x, y]) => [x + width, y]);
      const newFeature = new Feature(new LineString(newCoords));
      newFeature.setId(Date.now().toString());
      vectorSourceRef.current.addFeature(newFeature);
      mapRef.current.createSegmentOverlays(newFeature, mapRef);
      addHistoryAction({
        type: 'clone-feature',
        featureId: newFeature.getId(),
        prevCoords: [],
        newCoords: newCoords,
      });
    }
  };

  return (
    <button
      title="Clone Selected Geo"
      className="map-button"
      onClick={handleClone}
      disabled={!selectedFeature}
    >
      <CloneIcon />
    </button>
  );
};

export default Clone;