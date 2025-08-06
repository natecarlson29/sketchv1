import React, { useEffect, useRef, useState } from 'react';
import './style.css';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
// import Select from 'ol/interaction/Select';
import { fromLonLat } from 'ol/proj';
import { ScaleLine, Rotate } from 'ol/control';
import Translate from 'ol/interaction/Translate';
import Snap from 'ol/interaction/Snap';
import { /*always,*/  primaryAction } from 'ol/events/condition';
import GeoJSON from 'ol/format/GeoJSON';
import DeleteGeo from './map-actions/DeleteGeo';

/* map actions */
import History from './map-helpers/History';
import Edit from './map-helpers/Edit';
import FlipHorizButton from './map-actions/FlipHorizontal';
import FlipVertButton from './map-actions/FlipVertical';
import RightClick from './map-actions/RightClick';
import Clone from './map-actions/Clone';
import QuickShape from './map-actions/QuickShape';
import CurvatureTool from './map-actions/CurvatureTool';
import Controls from './map-helpers/Controls';

/* map stylings */
import {
  polygonStyle,
  activePolygonStyle,
  selectedPolygonStyle,
  ghostMarkerStyle,
  highlightSegmentStyle,
  highlightVertexStyle,
  closingSegmentStyle
} from './ol-styles';

/* svgs */
import {
  DrawIcon,
  HandIcon,
  QuestionIcon
} from './svg';

/*custom snapping imports*/
import {
  coordsEqual,
  getSnappedCoordinate,
  customSnapFeature,
} from './map-helpers/Snapping';

/* measurement helpers */
import {
  clearPolygonOverlays,
  createSegmentOverlays,
  pointToSegmentDistance
} from './map-helpers/Measurements';


const OFFSET_REF_DEFAULT = 1.524;

const App = () => {
  const [text, setText] = useState('');
  const textRef = useRef(text);
  const [mode, setMode] = useState('draw');
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, type: null, feature: null, index: null });
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const inputRef = useRef();
  const mapRef = useRef();
  const vectorSourceRef = useRef();
  const polygonFeatureRef = useRef();
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const offsetRef = useRef(OFFSET_REF_DEFAULT);
  const ghostMarkerRef = useRef(null);
  const modeRef = useRef(mode);
  const selectInteractionRef = useRef(null);
  const vectorLayerRef = useRef();
  const [showHistory, setShowHistory] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const altKeyRef = useRef(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  function addHistoryAction(action) {
    setHistory(prev => [...prev, action]);
    setRedoStack([]);

    //clear highlight layer
    if (action.type === 'delete-vertex' || action.type === 'delete-segment') {
      const highlightLayer = mapRef.current.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
      if (highlightLayer) {
        const highlightSource = highlightLayer.getSource();
        highlightSource.getFeatures().forEach(f => {
          if (!f.get('isClosingSegment')) {
            highlightSource.removeFeature(f);
          }
        });
      }
    }
  }

  function handleAddCurve(rise, run, bulge) {
    const feature = polygonFeatureRef.current;
    if (!feature) return;
    const poly = feature.getGeometry();
    let coords = poly.getCoordinates()[0];

    // Convert feet to meters
    const riseMeters = rise * 0.3048;
    const runMeters = run * 0.3048;
    const bulgeMeters = bulge * 0.3048;

    const start = coords[coords.length - 2];
    const end = [start[0] + runMeters, start[1] + riseMeters];

    // Calculate the midpoint of the straight line
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

    // Calculate the direction perpendicular to the segment
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular unit vector (to the left of the direction from start to end)
    const perp = [-dy / length, dx / length];

    // Control point for quadratic Bezier: midpoint plus bulge in perpendicular direction
    const control = [
      mid[0] + (bulgeMeters || 0) * perp[0],
      mid[1] + (bulgeMeters || 0) * perp[1]
    ];

    // Determine number of segments based on length (1 per foot, min 4, max 16)
    const feet = length / 0.3048;
    const segments = Math.max(4, Math.min(16, Math.round(feet)));

    // Generate points along the curve (excluding start, including end)
    const curvePoints = [];
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const x =
        (1 - t) * (1 - t) * start[0] +
        2 * (1 - t) * t * control[0] +
        t * t * end[0];
      const y =
        (1 - t) * (1 - t) * start[1] +
        2 * (1 - t) * t * control[1] +
        t * t * end[1];
      curvePoints.push([x, y]);
    }

    // Insert curve points into coords (replace last point with curve)
    let newCoords = [...coords.slice(0, -1), ...curvePoints];

    // Always close the polygon: last point === first point
    if (
      newCoords.length < 2 ||
      newCoords[0][0] !== newCoords[newCoords.length - 1][0] ||
      newCoords[0][1] !== newCoords[newCoords.length - 1][1]
    ) {
      newCoords.push([...newCoords[0]]);
    }

    poly.setCoordinates([newCoords]);
    // feature.set('no-measurements', true);
    createSegmentOverlays(feature, mapRef);

    // Track in history for undo/redo
    addHistoryAction({
      type: 'add-curve',
      featureId: feature.getId(),
      prevCoords: coords, // use the original coords before the curve
      newCoords: newCoords,
      curveParams: { rise, run, bulge }
    });
  }

  function isPolygonValid(coords) {
    // Simple check: at least 4 points (3 unique + closing), and no duplicate consecutive points
    if (!coords || coords.length < 4) return false;
    for (let i = 1; i < coords.length; i++) {
      if (coords[i][0] === coords[i - 1][0] && coords[i][1] === coords[i - 1][1]) return false;
    }
    // Optionally, add more robust self-intersection check here
    return true;
  }

  function onSegmentLengthChange(segmentIdx, newLengthFeet, onSuccess) {
    if (!selectedFeature) return;
    const poly = selectedFeature.getGeometry();
    let coords = poly.getCoordinates()[0].map(c => [...c]); // deep copy
    const N = coords.length - 1;
    const meters = newLengthFeet / 3.28084;

    if (segmentIdx < 0 || segmentIdx >= N) return;

    // Calculate direction vector for the segment
    const a = coords[segmentIdx];
    const b = coords[(segmentIdx + 1) % N];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const currentLen = Math.sqrt(dx * dx + dy * dy);

    if (currentLen === 0) {
      alert('Cannot resize a zero-length segment.');
      return;
    }

    let newCoords = coords.map(c => [...c]);
    if (segmentIdx !== N - 1) {
      // Move the second point of the segment
      const ratio = meters / currentLen;
      const newBx = a[0] + dx * ratio;
      const newBy = a[1] + dy * ratio;
      newCoords[segmentIdx + 1] = [newBx, newBy];
      newCoords[N] = newCoords[0];
    } else {
      // Last segment: move the LAST point (N-1), keep first point fixed
      const dirX = a[0] - b[0];
      const dirY = a[1] - b[1];
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLen === 0) {
        alert('Cannot resize a zero-length segment.');
        return;
      }
      const scale = meters / dirLen;
      const newLastX = b[0] + dirX * scale;
      const newLastY = b[1] + dirY * scale;
      newCoords[N - 1] = [newLastX, newLastY];
      newCoords[N] = newCoords[0];
    }

    // Validate polygon
    if (!isPolygonValid(newCoords)) {
      alert('This change would make the polygon invalid.');
      return;
    }

    // Save to history for undo/redo
    addHistoryAction({
      type: 'edit-segment-length',
      featureId: selectedFeature.getId(),
      prevCoords: coords,
      newCoords: newCoords,
      segmentIdx,
      newLengthFeet
    });

    // Update geometry
    poly.setCoordinates([newCoords]);
    updateClosingSegmentOverlay();
    createSegmentOverlays(selectedFeature, mapRef);
    handleEditHover(segmentIdx);

    //force refresh to <Edit />
    setShowEdit(false);
    setTimeout(() => {
      setShowEdit(true);
    }, 10)

    if (onSuccess) onSuccess();
  }

  //Polygon closing line shown with new style in highlight layer
  function updateClosingSegmentOverlay() {
    const highlightLayer = mapRef.current.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
    if (!highlightLayer) return;
    const highlightSource = highlightLayer.getSource();
    // Remove previous closing segment overlays
    highlightSource.getFeatures().forEach(f => {
      if (f.get('isClosingSegment')) highlightSource.removeFeature(f);
    });

    if (
      drawingRef.current &&
      polygonFeatureRef.current &&
      polygonFeatureRef.current.getGeometry().getType() === 'Polygon'
    ) {
      const coords = polygonFeatureRef.current.getGeometry().getCoordinates()[0];

      if (coords.length > 1) {
        const closingLine = new Feature(new LineString([coords[coords.length - 2], coords[0]]));
        closingLine.setStyle(closingSegmentStyle);
        closingLine.set('isClosingSegment', true);
        highlightSource.addFeature(closingLine);
      }
    }
  }

  function handleEditHover(segmentIdx) {
    if (!selectedFeature) return;
    const map = mapRef.current;
    if (!map) return;
    const highlightLayer = map.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
    if (!highlightLayer) return;
    const highlightSource = highlightLayer.getSource();

    // Remove previous highlights (except closing segments)
    highlightSource.getFeatures().forEach(f => {
      if (!f.get('isClosingSegment')) highlightSource.removeFeature(f);
    });

    const coords = selectedFeature.getGeometry().getCoordinates()[0];
    const N = coords.length - 1;
    if (segmentIdx < 0 || segmentIdx >= N) return;

    const segment = [
      coords[segmentIdx],
      coords[(segmentIdx + 1) % N]
    ];

    const segFeature = new Feature(new LineString(segment));
    segFeature.setStyle(highlightSegmentStyle);
    highlightSource.addFeature(segFeature);
  }
  function handleEditUnhover() {
    const map = mapRef.current;
    if (!map) return;
    const highlightLayer = map.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
    if (!highlightLayer) return;
    const highlightSource = highlightLayer.getSource();
    highlightSource.getFeatures().forEach(f => {
      if (!f.get('isClosingSegment')) highlightSource.removeFeature(f);
    });
  }

  //select features / style
  useEffect(() => {
    const allFeatures = vectorSourceRef.current?.getFeatures?.() || [];
    allFeatures.forEach(f => {
      if (f === selectedFeature) {
        f.setStyle(selectedPolygonStyle);
      } else {
        f.setStyle(polygonStyle);
      }
    });
  }, [selectedFeature]);

  //Read textbox input to be mapped with addSegment
  useEffect(() => {
    textRef.current = text;

    const val = parseFloat(text);
    if (!isNaN(val) && val > 0) {
      offsetRef.current = val * 0.3048;
    } else {
      offsetRef.current = OFFSET_REF_DEFAULT;
    }
  }, [text]);

  //Select vs Draw mode useEffect
  useEffect(() => {
    //sync modeRef with current mode
    modeRef.current = mode;

    const map = mapRef.current;
    if (!map) return;

    if (mode !== 'draw' && ghostMarkerRef.current) {
      vectorSourceRef.current.removeFeature(ghostMarkerRef.current);
      ghostMarkerRef.current = null;
    }

    if (selectInteractionRef.current) {
      map.removeInteraction(selectInteractionRef.current);
      selectInteractionRef.current = null;
    }

    if (mode === 'select') {
      let translate = new Translate({ layers: [vectorLayerRef.current], condition: primaryAction });
      map.addInteraction(translate);
      selectInteractionRef.current = translate;

      // Save the original coordinates before move starts
      translate.on('translatestart', (evt) => {
        evt.features.forEach(feature => {
          clearPolygonOverlays(feature, mapRef);
          feature.set('_prevCoords', feature.getGeometry().getCoordinates());
          setSelectedFeature(feature);
        });
      });

      // Custom snapping for translate interaction
      translate.on('translating', (evt) => {
        if (!altKeyRef.current) {
          evt.features.forEach(feature => {
            customSnapFeature(feature, vectorSourceRef.current, mapRef.current, 10);
          });
        }
      });

      // Listen for translateend to track moves
      translate.on('translateend', (evt) => {
        evt.features.forEach(feature => {
          // Save previous and new coordinates for undo/redo
          const prevCoords = feature.get('_prevCoords') || feature.getGeometry().getCoordinates();
          const newCoords = feature.getGeometry().getCoordinates();
          addHistoryAction({
            type: 'move-feature',
            featureId: feature.getId(),
            prevCoords,
            newCoords,
          });
          // Update _prevCoords for future moves
          feature.set('_prevCoords', newCoords);
          createSegmentOverlays(feature, mapRef);
        });
      });
    }

    return () => {
      if (selectInteractionRef.current) {
        map.removeInteraction(selectInteractionRef.current);
        selectInteractionRef.current = null;
      }
    };
  }, [mode]);

  /* MAIN USE EFFECT */

  useEffect(() => {
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: polygonStyle,
    });
    vectorLayerRef.current = vectorLayer;

    const map = new Map({
      target: 'map',
      layers: [
        new TileLayer({ source: new OSM() }),
        vectorLayer
      ],
      view: new View({
        center: fromLonLat([-95.87, 40.84]),
        zoom: 24,
      }),
    });

    map.addControl(new ScaleLine({ units: 'imperial' }));
    map.addControl(new Rotate({ autoHide: false, duration: 500 }));

    const snapInteraction = new Snap({ source: vectorSourceRef.current });
    map.addInteraction(snapInteraction)

    const highlightSource = new VectorSource();
    const highlightLayer = new VectorLayer({
      name: 'highlight',
      source: highlightSource,
      style: highlightSegmentStyle,
    });
    map.addLayer(highlightLayer);

    mapRef.current = map;

    // Expose createSegmentOverlays for use in handlers
    mapRef.current.createSegmentOverlays = (feature, mapRef) => createSegmentOverlays(feature, mapRef);

    map.on('pointermove', evt => {
      //GHOST MARKER LOGIC
      if (modeRef.current === 'draw' && !drawingRef.current) {
        const coord = evt.coordinate;
        const pixel = evt.pixel;
        const map = mapRef.current;
        const vectorSource = vectorSourceRef.current;

        // Try to snap to existing vertices
        let snappedCoord = coord;
        if (!altKeyRef.current) {
          snappedCoord = getSnappedCoordinate(map, vectorSource, pixel, 25) || coord;
        }

        if (ghostMarkerRef.current) {
          vectorSourceRef.current.removeFeature(ghostMarkerRef.current);
        }
        const ghost = new Feature(new Point(snappedCoord));
        ghost.setStyle(ghostMarkerStyle);
        vectorSourceRef.current.addFeature(ghost);
        ghostMarkerRef.current = ghost;
      } else if (ghostMarkerRef.current) {
        vectorSourceRef.current.removeFeature(ghostMarkerRef.current);
        ghostMarkerRef.current = null;
      } else/* if (modeRef.current === 'select')*/ {
        highlightSource.getFeatures().forEach(f => {
          if (!f.get('isClosingSegment')) {
            highlightSource.removeFeature(f);
          }
        });

        let found = false;
        // Hover logic for highlightLayer lines
        map.forEachFeatureAtPixel(evt.pixel, (feature, layer) => {
          if (feature.getGeometry().getType() === 'Polygon' || feature.getGeometry().getType() === 'LineString') {
            const coords = feature.getGeometry().getType() === 'Polygon'
              ? feature.getGeometry().getCoordinates()[0]
              : feature.getGeometry().getCoordinates();

            // Check for vertex hover first
            for (let i = 0; i < coords.length; i++) {
              const pixel = map.getPixelFromCoordinate(coords[i]);
              const dist = Math.sqrt(
                Math.pow(evt.pixel[0] - pixel[0], 2) + Math.pow(evt.pixel[1] - pixel[1], 2)
              );
              if (dist < 8) { // 8 pixels tolerance for vertex
                const vertexFeature = new Feature(new Point(coords[i]));
                vertexFeature.setStyle(highlightVertexStyle);
                highlightSource.addFeature(vertexFeature);
                found = true;
                return true; // Stop after first found
              }
            }

            // If no vertex found, check for segment hover
            for (let i = 0; i < coords.length - 1; i++) {
              const seg = [coords[i], coords[i + 1]];
              const pixel1 = map.getPixelFromCoordinate(seg[0]);
              const pixel2 = map.getPixelFromCoordinate(seg[1]);
              const dist = pointToSegmentDistance(evt.pixel, pixel1, pixel2);
              if (dist < 8) { // 8 pixels tolerance for segment
                const segFeature = new Feature(new LineString(seg));
                segFeature.setStyle(highlightSegmentStyle);
                highlightSource.addFeature(segFeature);
                found = true;
                return true; // Stop after first found
              }
            }
          }
          return found;
        });
      }
    });

    function editExistingPolygon(snappedCoord, vectorSource) {
      // Find a LineString whose endpoint matches snappedCoord
      let foundLine = null;
      let foundIndex = null;
      vectorSource.getFeatures().forEach(feature => {
        if (feature.getGeometry().getType() === 'LineString') {
          const coords = feature.getGeometry().getCoordinates();
          // Check both ends
          if (coordsEqual(coords[0], snappedCoord)) {
            foundLine = feature;
            foundIndex = 0;
          } else if (coordsEqual(coords[coords.length - 1], snappedCoord)) {
            foundLine = feature;
            foundIndex = coords.length - 1;
          }
        }
      });

      if (foundLine) {
        // Remove the LineString from the source
        clearPolygonOverlays(foundLine, mapRef);
        vectorSource.removeFeature(foundLine);
        let coords = foundLine.getGeometry().getCoordinates();
        // If the user clicked the end, reverse so snappedCoord is first
        if (foundIndex === coords.length - 1) {
          coords = coords.slice().reverse();
        }
        // Start a new polygon with these coords (not closed yet)
        return coords;
      }
      // No matching linestring found
      return null;
    }

    function drawClick(evt) {
      const coord = evt.coordinate;
      if (!drawingRef.current) {
        if (ghostMarkerRef.current) {
          vectorSourceRef.current.removeFeature(ghostMarkerRef.current);
          ghostMarkerRef.current = null;
        }

        const pixel = mapRef.current.getPixelFromCoordinate(coord);

        //custom snapping
        const snappedCoord = getSnappedCoordinate(mapRef.current, vectorSourceRef.current, pixel, 25) || coord;

        const vectorSource = vectorSourceRef.current;
        let initialCoords = editExistingPolygon(snappedCoord, vectorSource);

        let poly, feature;

        if (initialCoords) {
          // Remove all instances of snappedCoord from the array
          let coords = [...initialCoords];

          // Only close the polygon if not already closed
          if (
            coords.length > 2 &&
            (coords[0][0] !== coords[coords.length - 1][0] ||
              coords[0][1] !== coords[coords.length - 1][1])
          ) {
            coords.push([...coords[0]]);
          }

          console.log({ NEWPOLY: coords });
          // Create the polygon (now closed)
          poly = new Polygon([coords]);
          feature = new Feature(poly);
          feature.setId(Date.now().toString());
          createSegmentOverlays(feature, mapRef);
          addHistoryAction({
            type: 'convert-linestring-to-polygon',
            featureId: feature.getId(),
            prevCoords: initialCoords, // original LineString coordinates
            newCoords: coords,         // new Polygon coordinates
            geomType: 'Polygon',
            prevGeomType: 'LineString'
          });
        } else {
          // Normal: start polygon with just the clicked point
          poly = new Polygon([[snappedCoord, snappedCoord]]);
          feature = new Feature(poly);
          feature.setId(Date.now().toString());
          addHistoryAction({
            type: 'add-point',
            featureId: feature.getId(),
            prevCoords: [],
            newCoords: [[coord, coord]],
            point: snappedCoord,
            pointIndex: 0
          });
        }

        feature.setStyle(activePolygonStyle);
        vectorSource.addFeature(feature);
        polygonFeatureRef.current = feature;
        drawingRef.current = true;
        setDrawing(true);
      }
    }

    function selectClick(evt) { // maybe
      const features = map.getFeaturesAtPixel(evt.pixel).filter(f => vectorSourceRef.current.getFeatures().includes(f));
      // const features = map.getFeaturesAtPixel(evt.pixel);
      const allPolygons = vectorSourceRef.current.getFeatures();

      if (!features || features.length === 0) {
        // Deselect all: reset style for all polygons
        allPolygons.forEach(f => f.setStyle(polygonStyle));
        setSelectedFeature(null);
        setShowEdit(false);
        return;
      }

      let currentIdx = -1;
      // Cycle to the next feature
      const nextIdx = (currentIdx + 1) % features.length;
      const nextFeature = features[nextIdx];

      setSelectedFeature(nextFeature);
    }

    // --- MAP CLICK HANDLER ---
    map.on('singleclick', evt => {
      //DISABLED CLICK TO DRAW
      if (modeRef.current === 'draw' && ghostMarkerRef.current) {
        console.log('draw clicked');
        drawClick(evt);
      }
      if (modeRef.current === 'select') {
        selectClick(evt);
      }
    });

    function addSegment(direction) {
      if (!drawingRef.current) return;
      const feature = polygonFeatureRef.current;
      const poly = feature.getGeometry();
      let coords = poly.getCoordinates()[0];
      const last = coords.length === 1 ? coords[0] : coords[coords.length - 2];

      let dx = 0, dy = 0;
      const OFFSET = offsetRef.current;
      switch (direction) {
        case 'ArrowUp': dy = OFFSET; break;
        case 'ArrowDown': dy = -OFFSET; break;
        case 'ArrowLeft': dx = -OFFSET; break;
        case 'ArrowRight': dx = OFFSET; break;
        default: return;
      }

      // Rotate the direction vector by the negative of the map's rotation
      const map = mapRef.current;
      const rotation = map ? map.getView().getRotation() : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotatedDx = dx * cos - dy * sin;
      const rotatedDy = dx * sin + dy * cos;

      const newPt = [last[0] + rotatedDx, last[1] + rotatedDy];

      const prevCoords = [...coords];
      coords = [...coords.slice(0, -1), newPt, coords[coords.length - 1]];
      console.log({ AddSegmentCoords: coords });
      poly.setCoordinates([coords]);
      updateClosingSegmentOverlay();
      createSegmentOverlays(feature, mapRef);

      // Track action in history
      addHistoryAction({
        type: 'add-point',
        featureId: feature.getId(),
        prevCoords,
        newCoords: coords,
        point: newPt,
        pointIndex: coords.length - 2
      });
    }

    function handleUndo() {
      let lastActionForRedo = null;
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const lastAction = prev[prev.length - 1];
        lastActionForRedo = lastAction;

        // Find the feature by ID
        let feature = null;
        if (lastAction.featureId) {
          feature = vectorSourceRef.current.getFeatures().find(f => f.getId() === lastAction.featureId);
          if (!feature && polygonFeatureRef.current) feature = polygonFeatureRef.current;
        } else if (polygonFeatureRef.current) {
          feature = polygonFeatureRef.current;
        }
        if (!feature) return prev.slice(0, -1);

        const prevCoords = lastAction.prevCoords;

        if (lastAction.type === 'delete-segment') {
          // Remove the current feature (could be a LineString or Polygon)
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef);
            vectorSourceRef.current.removeFeature(featureToRemove);
          }

          let restoredFeature;
          if (lastAction.geomType === 'Polygon') {
            restoredFeature = new Feature(new Polygon([lastAction.prevCoords]));
          } else if (lastAction.geomType === 'LineString') {
            restoredFeature = new Feature(new LineString(lastAction.prevCoords));
          }
          if (restoredFeature && lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          if (restoredFeature) {
            vectorSourceRef.current.addFeature(restoredFeature);
            polygonFeatureRef.current = restoredFeature;
            if (lastAction.prevCoords && lastAction.prevCoords.length > 1) {
              updateClosingSegmentOverlay();
              createSegmentOverlays(restoredFeature, mapRef);
            }
          }
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'flip-horizontal' || lastAction.type === 'flip-vertical') {
          if (feature) {
            feature.getGeometry().setCoordinates([lastAction.prevCoords]);
            if (lastAction.prevCoords.length > 1) {
              createSegmentOverlays(feature, mapRef);
            }
          }
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'move-feature') {
          if (feature && lastAction.prevCoords) {
            feature.getGeometry().setCoordinates(lastAction.prevCoords);
            createSegmentOverlays(feature, mapRef);
          }
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'draw-circle') {
          // Remove the circle feature
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef);
            vectorSourceRef.current.removeFeature(featureToRemove);
          }
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'draw-square') {
          // Remove the square feature
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef);
            vectorSourceRef.current.removeFeature(featureToRemove);
          }
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'delete-geo') {
          // Restore the deleted feature
          const format = new GeoJSON();
          const restoredFeature = format.readFeature(lastAction.geojson);
          if (lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          vectorSourceRef.current.addFeature(restoredFeature);
          polygonFeatureRef.current = restoredFeature;
          createSegmentOverlays(restoredFeature, mapRef);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'convert-linestring-to-polygon') {
          // Remove the polygon feature
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef);
            vectorSourceRef.current.removeFeature(featureToRemove);
          }
          // Restore the original LineString
          const restoredFeature = new Feature(new LineString(lastAction.prevCoords));
          if (lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          vectorSourceRef.current.addFeature(restoredFeature);
          polygonFeatureRef.current = restoredFeature;
          createSegmentOverlays(restoredFeature, mapRef);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'edit-segment-length') {
          if (feature && lastAction.prevCoords) {
            feature.getGeometry().setCoordinates([lastAction.prevCoords]);
            createSegmentOverlays(feature, mapRef);
            updateClosingSegmentOverlay();
          }
          return prev.slice(0, -1);
        }

        // If undoing would result in no points or just one, remove the feature and reset drawing state
        if (!prevCoords || prevCoords.length <= 1) {
          clearPolygonOverlays(feature, mapRef);
          vectorSourceRef.current.removeFeature(feature);
          polygonFeatureRef.current = null;
          drawingRef.current = false;
          setDrawing(false);
          return prev.slice(0, -1);
        }

        // Otherwise, restore previous geometry
        const geomType = feature.getGeometry().getType();
        if (geomType === 'Polygon') {
          feature.getGeometry().setCoordinates([prevCoords]);
        } else if (geomType === 'LineString') {
          feature.getGeometry().setCoordinates(prevCoords);
        }
        if (prevCoords.length > 1) {
          updateClosingSegmentOverlay();
          createSegmentOverlays(feature, mapRef);
        }

        return prev.slice(0, -1);
      });
      // Only push to redoStack ONCE per undo, after setHistory runs
      if (lastActionForRedo) {
        setRedoStack(redoPrev => [...redoPrev, lastActionForRedo]);
      }
    }

    function handleRedo() {
      setRedoStack(prev => {
        if (prev.length === 0) return prev;
        const lastAction = prev[prev.length - 1];

        // Find the feature by ID
        let feature = null;
        if (lastAction.featureId) {
          feature = vectorSourceRef.current.getFeatures().find(f => f.getId() === lastAction.featureId);
          if (!feature && polygonFeatureRef.current) feature = polygonFeatureRef.current;
        } else if (polygonFeatureRef.current) {
          feature = polygonFeatureRef.current;
        }

        const newCoords = lastAction.newCoords;

        if (lastAction.type === 'delete-segment') {
          // Remove the polygon feature
          if (feature) {
            clearPolygonOverlays(feature, mapRef);
            vectorSourceRef.current.removeFeature(feature);
          }
          // Create a new LineString feature with the newCoords
          const LineString = require('ol/geom/LineString').default;
          const lineFeature = new Feature(new LineString(newCoords));
          if (lastAction.featureId) lineFeature.setId(lastAction.featureId);
          vectorSourceRef.current.addFeature(lineFeature);
          if (mapRef.current && mapRef.current.remarkLineSegments) {
            mapRef.current.remarkLineSegments(lineFeature);
          }
          updateClosingSegmentOverlay();
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'add-point' || lastAction.type === 'delete-vertex') {
          if (feature) {
            feature.getGeometry().setCoordinates([newCoords]);
            if (newCoords.length > 1) {
              createSegmentOverlays(feature, mapRef);
            }
          }
          updateClosingSegmentOverlay();
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'flip-horizontal' || lastAction.type === 'flip-vertical') {
          if (feature) {
            feature.getGeometry().setCoordinates([lastAction.newCoords]);
            if (lastAction.newCoords.length > 1) {
              createSegmentOverlays(feature, mapRef);
            }
          }
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'move-feature') {
          if (feature && lastAction.newCoords) {
            feature.getGeometry().setCoordinates(lastAction.newCoords);
            createSegmentOverlays(feature, mapRef);
          }
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'convert-linestring-to-polygon') {
          // Remove the LineString feature
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef);
            vectorSourceRef.current.removeFeature(featureToRemove);
          }
          // Restore the Polygon
          const restoredFeature = new Feature(new Polygon([lastAction.newCoords]));
          if (lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          restoredFeature.setStyle(activePolygonStyle);
          vectorSourceRef.current.addFeature(restoredFeature);
          polygonFeatureRef.current = restoredFeature;
          createSegmentOverlays(restoredFeature, mapRef);
          updateClosingSegmentOverlay();
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'draw-circle') {
          // Re-add the circle feature
          const restoredFeature = new Feature(new Polygon(lastAction.coords));
          if (lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          vectorSourceRef.current.addFeature(restoredFeature);
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'draw-square') {
          // Re-add the square feature
          const restoredFeature = new Feature(new Polygon(lastAction.coords));
          if (lastAction.featureId) restoredFeature.setId(lastAction.featureId);
          vectorSourceRef.current.addFeature(restoredFeature);
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'delete-geo') {
          // Remove the feature again
          let featureToRemove = vectorSourceRef.current.getFeatures().find(
            f => f.getId && f.getId() === lastAction.featureId
          );
          if (featureToRemove) {
            clearPolygonOverlays(featureToRemove, mapRef); // Clear measurementsa
            vectorSourceRef.current.removeFeature(featureToRemove);
          }
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        if (lastAction.type === 'edit-segment-length') {
          if (feature && lastAction.newCoords) {
            feature.getGeometry().setCoordinates([lastAction.newCoords]);
            createSegmentOverlays(feature, mapRef);
            updateClosingSegmentOverlay();
          }
          setHistory(histPrev => [...histPrev, lastAction]);
          return prev.slice(0, -1);
        }

        // Add more redo logic for other action types as needed...

        return prev;
      });
    }

    function rotateMapToHighlightedSegment(map, highlightSource) {
      const features = highlightSource.getFeatures();
      const segFeature = features.find(f => f.getGeometry().getType() === 'LineString');
      if (!segFeature) return;

      const coords = segFeature.getGeometry().getCoordinates();
      if (coords.length < 2) return;

      const [start, end] = coords;

      const view = map.getView();
      const currentRotation = view.getRotation();

      const startPixel = map.getPixelFromCoordinate(start);
      const endPixel = map.getPixelFromCoordinate(end);

      // Undo current rotation to get true screen-space angle
      const cos = Math.cos(-currentRotation);
      const sin = Math.sin(-currentRotation);

      const dx = endPixel[0] - startPixel[0];
      const dy = endPixel[1] - startPixel[1];

      const unrotatedDx = dx * cos - dy * sin;
      const unrotatedDy = dx * sin + dy * cos;

      const angle = Math.atan2(unrotatedDy, unrotatedDx);
      const rotation = Math.PI / 2 - angle;

      // Center on the midpoint of the segment
      const center = [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2
      ];

      view.animate({
        center,
        rotation,
        duration: 600
      });
    }


    function handleKeyDown(e) {
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        if (modeRef.current === 'draw') {
          e.preventDefault();
          addSegment(e.key);
        }
      }

      // 'Enter' to calculate next line from the textbox input
      if (e.key === 'Enter' && drawingRef.current && modeRef.current === 'draw') {
        const feature = polygonFeatureRef.current;
        const poly = feature.getGeometry();
        let coords = poly.getCoordinates()[0];
        const last = coords.length === 1 ? coords[0] : coords[coords.length - 2];

        const input = textRef.current.trim().toUpperCase();

        let dx = 0, dy = 0;

        // 1. Handle direction notation (e.g. R10+U5)
        const dirPattern = /^([RLUD]\d+(\+\s*[RLUD]\d+)*)$/;
        if (dirPattern.test(input)) {
          // Split by '+'
          const parts = input.split('+').map(s => s.trim());
          for (const part of parts) {
            const dir = part[0];
            const val = parseFloat(part.slice(1));
            if (isNaN(val)) continue;
            const meters = val * 0.3048;
            switch (dir) {
              case 'R': dx += meters; break;
              case 'L': dx -= meters; break;
              case 'U': dy += meters; break;
              case 'D': dy -= meters; break;
              default: break;
            }
          }
          // Rotate the direction vector by the map's rotation
          const map = mapRef.current;
          const rotation = map ? map.getView().getRotation() : 0;
          const cos = Math.cos(rotation);
          const sin = Math.sin(rotation);
          const rotatedDx = dx * cos - dy * sin;
          const rotatedDy = dx * sin + dy * cos;
          const newPt = [last[0] + rotatedDx, last[1] + rotatedDy];

          const prevCoords = [...coords];
          coords = [...coords.slice(0, -1), newPt, coords[coords.length - 1]];
          poly.setCoordinates([coords]);
          updateClosingSegmentOverlay();
          createSegmentOverlays(feature, mapRef);

          addHistoryAction({
            type: 'add-point',
            featureId: feature.getId(),
            prevCoords,
            newCoords: coords,
            point: newPt,
            pointIndex: coords.length - 2
          });

          setText('');
          return;
        }

        // 2. Handle length/angle notation (e.g. 10/180)
        let distance = 0;
        let angleDeg = 0;
        if (input.includes('/')) {
          const [distStr, angleStr] = input.split('/');
          distance = parseFloat(distStr);
          angleDeg = parseFloat(angleStr);
        } else {
          distance = parseFloat(input);
          angleDeg = 0;
        }
        if (isNaN(distance)) return; // Invalid input

        distance = distance * 0.3048;
        const map = mapRef.current;
        const rotation = map ? map.getView().getRotation() : 0;
        const angleRad = (angleDeg * Math.PI) / 180 + rotation;

        const dx2 = distance * Math.cos(angleRad);
        const dy2 = distance * Math.sin(angleRad);
        const newPt = [last[0] + dx2, last[1] + dy2];

        const prevCoords = [...coords];
        coords = [...coords.slice(0, -1), newPt, coords[coords.length - 1]];
        poly.setCoordinates([coords]);
        updateClosingSegmentOverlay();
        createSegmentOverlays(feature, mapRef);

        addHistoryAction({
          type: 'add-point',
          featureId: feature.getId(),
          prevCoords,
          newCoords: coords,
          point: newPt,
          pointIndex: coords.length - 2
        });

        setText('');
      }

      // 'a' to finish polygon
      if ((e.key === 'a' || e.key === 'A') && drawingRef.current && modeRef.current === 'draw') {
        const feature = polygonFeatureRef.current;
        const poly = feature.getGeometry();
        let coords = poly.getCoordinates()[0];
        if (coords.length > 2) {
          coords[coords.length - 1] = coords[0];
          poly.setCoordinates([coords]);
          feature.setStyle(polygonStyle);
          createSegmentOverlays(feature, mapRef);
          drawingRef.current = false;
          setDrawing(false);
          setMode('');
        }
        const highlightLayer = mapRef.current.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
        if (highlightLayer) {
          const highlightSource = highlightLayer.getSource();
          highlightSource.getFeatures().forEach(f => {
            if (f.get('isClosingSegment')) highlightSource.removeFeature(f);
          });
        }

      }
      // ctrl + z
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'z' || e.key === 'Z')
      ) {
        e.preventDefault();
        handleUndo();
      }
      // ctrl + y
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || e.key === 'Y')
      ) {
        e.preventDefault();
        handleRedo();
      }
      //ctrl + r
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'r' || e.key === 'R')
      ) {
        e.preventDefault();
        const map = mapRef.current;
        const highlightLayer = map.getLayers().getArray().find(layer => layer.get('name') === 'highlight');
        if (map && highlightLayer) {
          rotateMapToHighlightedSegment(map, highlightLayer.getSource());
        }
      }
      //alt press
      if (e.altKey) {
        e.preventDefault();
        altKeyRef.current = true;
      }
    }

    function handleKeyUp(e) {
      if (!e.altKey) {
        altKeyRef.current = false;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Clean up on unmount
    return () => {
      vectorSource.getFeatures().forEach(f => clearPolygonOverlays(f, mapRef));
      map.setTarget(null);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      if (selectInteractionRef.current) {
        map.removeInteraction(selectInteractionRef.current);
        selectInteractionRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <div id="dimension-input-container">
        <input
          id="dimension-input"
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Dimension (ft.)"
          autoFocus
          autoComplete='off'
        />
      </div>
      <div id="map-menu-vert">
        <button
          title="Draw"
          className={`map-button${mode === 'draw' ? ' active' : ''}`}
          onClick={() => setMode('draw')}
          disabled={mode === 'draw' && drawing}>
          <DrawIcon />
        </button>
        <button
          title="Select / Move"
          className={`map-button${mode === 'select' ? ' active' : ''}`}
          onClick={() => setMode('select')}
          disabled={mode === 'draw' && drawing}>
          <HandIcon />
        </button>
        <CurvatureTool
          enabled={mode === 'draw' && drawingRef.current && polygonFeatureRef.current}
          onAddCurve={handleAddCurve}
        />
        <QuickShape mapRef={mapRef} vectorSourceRef={vectorSourceRef} setDrawing={setDrawing} setMode={setMode} addHistoryAction={addHistoryAction} mode={mode} drawing={drawing} />
        <DeleteGeo
          selectedFeature={selectedFeature}
          vectorSourceRef={vectorSourceRef}
          setSelectedFeature={setSelectedFeature}
          addHistoryAction={addHistoryAction}
          clearPolygonOverlays={clearPolygonOverlays}
          mapRef={mapRef}
        />
      </div>
      <div id="map-menu-horiz">
        <FlipHorizButton selectedFeature={selectedFeature} mapRef={mapRef} addHistoryAction={addHistoryAction} />
        <FlipVertButton selectedFeature={selectedFeature} mapRef={mapRef} addHistoryAction={addHistoryAction} />
        <Clone selectedFeature={selectedFeature} vectorSourceRef={vectorSourceRef} setSelectedFeature={setSelectedFeature} addHistoryAction={addHistoryAction} mapRef={mapRef} />
        <div title="Show/Hide History" id="history-toggle" className={`map-button${showHistory ? ' active' : ''}`} onClick={() => setShowHistory(v => !v)}>
          History
        </div>
        <div
          title="Edit Segments"
          id="edit-toggle"
          className={`map-button${showEdit ? ' active' : ''}`}
          onClick={() => setShowEdit(v => !v)}
          style={{ marginLeft: 8, opacity: selectedFeature ? 1 : 0.5, pointerEvents: selectedFeature ? 'auto' : 'none' }}
        >
          Edit
        </div>
        <div
          title="Show Controls"
          className="map-button"
          onClick={() => setControlsOpen(true)}
          style={{ marginLeft: 8 }}
        >
          <QuestionIcon />
        </div>
      </div>
      <div id="map"></div>
      <RightClick
        mapRef={mapRef}
        vectorSourceRef={vectorSourceRef}
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        clearPolygonOverlays={(feature) => clearPolygonOverlays(feature, mapRef)}
        addHistoryAction={addHistoryAction}
        drawing={drawing}
      />
      {showHistory && (
        <History
          history={history}
          redoStack={redoStack}
        />
      )}
      {showEdit && selectedFeature && (
        <Edit
          feature={selectedFeature}
          onSegmentHover={handleEditHover}
          onSegmentUnhover={handleEditUnhover}
          onSegmentLengthChange={onSegmentLengthChange}
        />
      )}
      {controlsOpen && (
        <Controls open={controlsOpen} onClose={() => setControlsOpen(false)} />
      )}
    </div>
  );
};

export default App;