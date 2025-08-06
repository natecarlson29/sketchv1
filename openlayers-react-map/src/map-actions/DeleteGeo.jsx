import React from "react";
import GeoJSON from "ol/format/GeoJSON";
import { TrashCanIcon } from "../svg";

export default function DeleteGeo({ selectedFeature, vectorSourceRef, setSelectedFeature, addHistoryAction, clearPolygonOverlays, mapRef }) {
  const handleDelete = () => {
    console.log('delete hit');
    if (selectedFeature && vectorSourceRef.current) {
      // Clear measurement overlays for this feature
      if (clearPolygonOverlays && mapRef) {
        clearPolygonOverlays(selectedFeature, mapRef);
      }
      // Serialize the feature for undo
      const geojson = new GeoJSON().writeFeatureObject(selectedFeature);
      vectorSourceRef.current.removeFeature(selectedFeature);
      setSelectedFeature(null);

      addHistoryAction({
        type: "delete-geo",
        featureId: selectedFeature.getId(),
        geojson,
      });
    }
  };

  return (
    <button
      title="Delete Selected Geo"
      className="map-button"
      disabled={!selectedFeature}
      onClick={handleDelete}
    >
      <TrashCanIcon />
    </button>
  );
}