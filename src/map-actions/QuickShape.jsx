import React, { useState, useRef, useEffect } from "react";
import { QuickShapeIcon } from "../svg";
import Draw from "ol/interaction/Draw";
import Polygon, { fromCircle } from "ol/geom/Polygon";
// import Circle from "ol/geom/Circle";
import Overlay from "ol/Overlay";
import { createSegmentOverlays } from "../map-helpers/Measurements";

const SHAPES = [
  { name: "Circle", value: "circle" },
  // { name: "Triangle", value: "triangle" },
  { name: "Square", value: "square" },
];

export default function QuickShape({ mapRef, vectorSourceRef, setDrawing, setMode, addHistoryAction, mode, drawing }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef();
  const drawRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (drawRef.current && map) {
        map.removeInteraction(drawRef.current);
        drawRef.current = null;
      }
    };
  }, [mapRef]);

  function handleShapeClick(shape) {
    setOpen(false);
    if (!mapRef.current || !vectorSourceRef.current) return;

    // Remove any existing draw interaction
    if (drawRef.current) {
      mapRef.current.removeInteraction(drawRef.current);
      drawRef.current = null;
    }

    if (shape.value === "circle") {
      const draw = new Draw({
        source: vectorSourceRef.current,
        type: "Circle",
      });
      mapRef.current.addInteraction(draw);
      drawRef.current = draw;
      setDrawing(true);
      setMode("circle");

      draw.on("drawend", (evt) => {
        const circleGeom = evt.feature.getGeometry();
        const polygonGeom = fromCircle(circleGeom, 64);
        evt.feature.setGeometry(polygonGeom);
        evt.feature.set("no-measurements", true);

        if (!evt.feature.getId()) {
          evt.feature.setId(Date.now().toString());
        }

        addHistoryAction({
          type: "draw-circle",
          featureId: evt.feature.getId(),
          coords: polygonGeom.getCoordinates(),
        });

        setDrawing(false);
        setMode("select");
        if (drawRef.current) {
          mapRef.current.removeInteraction(drawRef.current);
          drawRef.current = null;
        }
      });
    }

    if (shape.value === "square") {
      let lengthOverlay = null;
      let overlayEl = null;

      function createSquareGeometry(coordinates, geometry) {
        const [center, edge] = coordinates;
        if (!center || !edge) return geometry;
        const dx = edge[0] - center[0];
        const dy = edge[1] - center[1];
        const halfSide = Math.max(Math.abs(dx), Math.abs(dy));
        const sideLength = halfSide * 2;

        // Always start at 0 radians (right/east), so the square is upright
        const angle = 0;

        const corners = [];
        for (let i = 0; i < 4; i++) {
          const theta = angle + (i * Math.PI / 2);
          corners.push([
            center[0] + halfSide * Math.cos(theta) - halfSide * Math.sin(theta),
            center[1] + halfSide * Math.sin(theta) + halfSide * Math.cos(theta)
          ]);
        }
        corners.push(corners[0]); // close the ring

        const sideLengthFeet = sideLength * 3.28084;
        if (overlayEl && edge) {
          overlayEl.innerText = `Side Length: ${sideLengthFeet.toFixed(2)} ft`;
          if (lengthOverlay) {
            lengthOverlay.setPosition(edge);
          }
        }

        if (!geometry) geometry = new Polygon([corners]);
        else geometry.setCoordinates([corners]);
        return geometry;
      }

      const draw = new Draw({
        source: vectorSourceRef.current,
        type: "Circle",
        geometryFunction: createSquareGeometry,
      });
      mapRef.current.addInteraction(draw);
      drawRef.current = draw;
      setDrawing(true);
      setMode("square");

      draw.on("drawstart", (evt) => {
        overlayEl = document.createElement("div");
        overlayEl.style.background = "white";
        overlayEl.style.border = "1px solid #333";
        overlayEl.style.padding = "2px 6px";
        overlayEl.style.borderRadius = "4px";
        overlayEl.style.fontSize = "12px";
        overlayEl.style.pointerEvents = "none";
        overlayEl.style.position = "relative";
        overlayEl.style.whiteSpace = "nowrap";
        overlayEl.innerText = "Side Length: 0.00 ft";

        lengthOverlay = new Overlay({
          element: overlayEl,
          offset: [10, 0],
          positioning: "center-left",
          stopEvent: false,
        });
        mapRef.current.addOverlay(lengthOverlay);
      });

      draw.on("drawend", (evt) => {
        const squareGeom = evt.feature.getGeometry();

        if (!evt.feature.getId()) {
          evt.feature.setId(Date.now().toString());
        }

        addHistoryAction({
          type: "draw-square",
          featureId: evt.feature.getId(),
          coords: squareGeom.getCoordinates(),
        });

        createSegmentOverlays(evt.feature, mapRef);

        if (lengthOverlay) {
          mapRef.current.removeOverlay(lengthOverlay);
          lengthOverlay = null;
          overlayEl = null;
        }

        setDrawing(false);
        setMode("select");
        if (drawRef.current) {
          mapRef.current.removeInteraction(drawRef.current);
          drawRef.current = null;
        }
      });
    }
    // Other shapes can be added here similarly
  }

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        title="Quick Shape"
        className={`map-button${["circle", "square"].includes(mode) ? " active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        disabled={drawing}
      >
        <QuickShapeIcon style={{ width: 24, height: 24 }} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "110%",
            transform: "translateY(-50%)",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 10,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center"
          }}
        >
          {SHAPES.map((shape) => (
            <div
              key={shape.value}
              style={{
                position: "relative",
                width: "60%",
                padding: "6px 12px",
                cursor: "pointer",
                textAlign: "center",
                borderRadius: 3,
                margin: 2,
                transition: "background 0.2s",
              }}
              className="quickshape-item"
              onClick={() => handleShapeClick(shape)}
              onMouseDown={e => e.preventDefault()}
            >
              {shape.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}