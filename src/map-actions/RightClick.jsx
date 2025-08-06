import React, { useEffect, useState } from 'react';
import { Feature } from 'ol';
import LineString from 'ol/geom/LineString';
import Modal from '../map-helpers/Modal';

const RightClick = ({
  mapRef,
  vectorSourceRef,
  contextMenu,
  setContextMenu,
  clearPolygonOverlays: clearOverlaysProp,
  addHistoryAction,
  drawing
}) => {
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  useEffect(() => {
    function handleCustomContextMenu(e) {
      const mapDiv = document.getElementById('map');
      if (!mapDiv || !mapRef.current || !vectorSourceRef.current) return;
      if (!mapDiv.contains(e.target)) return;
      e.preventDefault();
      const pixel = mapRef.current.getEventPixel(e);
      const features = vectorSourceRef.current.getFeatures();

      let found = false;
      for (const feature of features) {
        const geom = feature.getGeometry();
        let coords = null;
        if (geom.getType() === 'Polygon') {
          coords = geom.getCoordinates()[0];
        } else if (geom.getType() === 'LineString') {
          coords = geom.getCoordinates();
        }
        if (coords) {
          // For polygons, skip last duplicate point
          const len = geom.getType() === 'Polygon' ? coords.length - 1 : coords.length;
          for (let i = 0; i < len; i++) {
            const coordPixel = mapRef.current.getPixelFromCoordinate(coords[i]);
            if (Math.hypot(pixel[0] - coordPixel[0], pixel[1] - coordPixel[1]) < 8) {
              setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'vertex', feature, index: i });
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }

      if (!found) {
        for (const feature of features) {
          const geom = feature.getGeometry();
          let coords = null;
          if (geom.getType() === 'Polygon') {
            coords = geom.getCoordinates()[0];
          } else if (geom.getType() === 'LineString') {
            coords = geom.getCoordinates();
          }
          if (coords) {
            // For polygons, skip last duplicate point
            const len = geom.getType() === 'Polygon' ? coords.length - 1 : coords.length - 1;
            for (let i = 0; i < len; i++) {
              const c1 = mapRef.current.getPixelFromCoordinate(coords[i]);
              const c2 = mapRef.current.getPixelFromCoordinate(coords[i + 1]);
              const t = ((pixel[0] - c1[0]) * (c2[0] - c1[0]) + (pixel[1] - c1[1]) * (c2[1] - c1[1])) /
                ((c2[0] - c1[0]) ** 2 + (c2[1] - c1[1]) ** 2);
              if (t >= 0 && t <= 1) {
                const proj = [c1[0] + t * (c2[0] - c1[0]), c1[1] + t * (c2[1] - c1[1])];
                if (Math.hypot(pixel[0] - proj[0], pixel[1] - proj[1]) < 8) {
                  setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: 'segment', feature, index: i });
                  found = true;
                  break;
                }
              }
            }
          }
          if (found) break;
        }
      }

      if (!found) setContextMenu({ visible: true, x: e.clientX, y: e.clientY, type: null, feature: null, index: null });
    }

    document.addEventListener('contextmenu', handleCustomContextMenu);
    return () => document.removeEventListener('contextmenu', handleCustomContextMenu);
  }, [mapRef, vectorSourceRef, setContextMenu]);

  useEffect(() => {
    function hideMenu() {
      setContextMenu(menu => menu.visible ? { ...menu, visible: false } : menu);
    }
    window.addEventListener('click', hideMenu);
    return () => window.removeEventListener('click', hideMenu);
  }, [setContextMenu]);

  // Helper to deep clone coordinates
  const cloneCoords = coords => coords.map(c => Array.isArray(c) ? [...c] : c);

  const handleMenuAction = (action) => {
    if (!contextMenu.feature) return;
    const geom = contextMenu.feature.getGeometry();
    let coords;
    if (geom.getType() === 'Polygon') {
      const arr = geom.getCoordinates()[0];
      if (!Array.isArray(arr) || arr.length < 3 || !Array.isArray(arr[0])) return;
      coords = arr.map(c => [c[0], c[1]]);
    } else if (geom.getType() === 'LineString') {
      const arr = geom.getCoordinates();
      if (!Array.isArray(arr) || arr.length < 2 || !Array.isArray(arr[0])) return;
      coords = arr.map(c => [c[0], c[1]]);
    } else {
      return;
    }

    if (action === 'delete-vertex') {
      const prevCoords = cloneCoords(coords);
      const newCoords = cloneCoords(coords);
      newCoords.splice(contextMenu.index, 1);

      if (geom.getType() === 'Polygon') {
        // Only delete if at least 4 points remain (3 + closing point)
        if (newCoords.length < 4) {
          setShowModal(true);
          setModalMessage('Cannot delete vertex: at least 3 points required for a polygon');
          return;
        }
        newCoords[newCoords.length - 1] = newCoords[0]; // close ring
        geom.setCoordinates([newCoords]);
      } else if (geom.getType() === 'LineString') {
        // Only delete if at least 2 points remain (minimum for a line)
        if (newCoords.length < 2) {
          setShowModal(true);
          setModalMessage('Cannot delete vertex: at least 2 points required for a line');
          return;
        }
        geom.setCoordinates(newCoords);
      } else {
        return;
      }

      if (mapRef.current && mapRef.current.createSegmentOverlays) {
        mapRef.current.createSegmentOverlays(contextMenu.feature, mapRef);
      }
      setContextMenu({ ...contextMenu, visible: false });

      addHistoryAction({
        type: 'delete-vertex',
        featureId: contextMenu.feature.getId && contextMenu.feature.getId(),
        prevCoords,
        newCoords,
        index: contextMenu.index,
        geomType: geom.getType()
      });
    }

    if (action === 'delete-segment') {
      if (clearOverlaysProp) clearOverlaysProp(contextMenu.feature);
      const prevCoords = cloneCoords(coords);

      if (geom.getType() === 'Polygon') {
        if (
          coords.length > 3 &&
          coords[0][0] === coords[coords.length - 1][0] &&
          coords[0][1] === coords[coords.length - 1][1]
        ) {
          coords = coords.slice(0, coords.length - 1);
        }
        const index = contextMenu.index;
        const part1 = coords.slice(index + 1);
        const part2 = coords.slice(0, index + 1);
        const newCoords = [...part1, ...part2];

        if (vectorSourceRef.current && vectorSourceRef.current.getFeatures().includes(contextMenu.feature)) {
          vectorSourceRef.current.removeFeature(contextMenu.feature);
        }
        const lineFeature = new Feature(new LineString(newCoords));
        if (contextMenu.feature.getId) {
          lineFeature.setId(contextMenu.feature.getId());
        }
        vectorSourceRef.current.addFeature(lineFeature);

        if (mapRef.current && mapRef.current.createSegmentOverlays) {
          mapRef.current.createSegmentOverlays(lineFeature, mapRef);
        }
        setContextMenu({ ...contextMenu, visible: false });

        addHistoryAction({
          type: 'delete-segment',
          featureId: contextMenu.feature.getId && contextMenu.feature.getId(),
          prevCoords,
          newCoords: cloneCoords(newCoords),
          index: contextMenu.index,
          geomType: 'Polygon'
        });

      } else if (geom.getType() === 'LineString') {
        // Only allow if at least 3 points (2 segments)
        if (coords.length < 3) {
          setShowModal(true);
          setModalMessage('Cannot delete segment: at least 3 points required for a line');
          return;
        }
        const index = contextMenu.index;
        // Remove the endpoint after the segment index
        const newCoords = cloneCoords(coords);
        newCoords.splice(index + 1, 1);

        geom.setCoordinates(newCoords);

        if (mapRef.current && mapRef.current.createSegmentOverlays) {
          mapRef.current.createSegmentOverlays(contextMenu.feature, mapRef);
        }
        setContextMenu({ ...contextMenu, visible: false });

        addHistoryAction({
          type: 'delete-segment',
          featureId: contextMenu.feature.getId && contextMenu.feature.getId(),
          prevCoords,
          newCoords: cloneCoords(newCoords),
          index: contextMenu.index,
          geomType: 'LineString'
        });
      }
    }
  };

  return (
    <>
      <Modal
        open={showModal}
        message={modalMessage}
        onClose={() => {
          setShowModal(false);
          setModalMessage('');
        }}
      />
      {contextMenu.visible ? (
        <div className="right-click-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#fff',
            border: '1px solid #ccc',
            zIndex: 1000,
            padding: 4,
            minWidth: 120
          }}
          onContextMenu={e => e.preventDefault()}
          onMouseLeave={() => setContextMenu({ ...contextMenu, visible: false })}
        >
          {contextMenu.type === 'vertex' ? (
            <div
              className="menu-item"
              onClick={() => handleMenuAction('delete-vertex')}
              style={{ cursor: 'pointer', padding: '4px 8px' }}
            >
              Delete Vertex
            </div>
          ) :
            contextMenu.type === 'segment' && !drawing ? (
              <div
                className="menu-item"
                onClick={() => handleMenuAction('delete-segment')}
                style={{ cursor: 'pointer', padding: '4px 8px' }}
              >
                Delete Segment
              </div>
            ) :
              (<div style={{ color: '#888', padding: '4px 8px' }}>No actions</div>)}
        </div>
      ) : null}
    </>
  );
};

export default RightClick;