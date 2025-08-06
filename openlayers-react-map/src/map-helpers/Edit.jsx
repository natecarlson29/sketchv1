import React, { useState, useEffect, useMemo } from 'react';
import '../style.css';

function segmentLengthFeet(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const meters = Math.sqrt(dx * dx + dy * dy);
  return meters * 3.28084;
}

const Edit = ({ feature, onSegmentHover, onSegmentUnhover, onSegmentLengthChange }) => {
  // Use a stable geometry dependency for useMemo
  const geometry = feature ? feature.getGeometry() : null;

  // Memoize coords so it only changes when geometry changes
  const coords = useMemo(() => {
    if (!geometry) return [];
    const arr = geometry.getCoordinates();
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : [];
  }, [geometry]);

  const N = coords.length > 0 ? coords.length - 1 : 0;

  const [inputs, setInputs] = useState(
    Array.from({ length: N }, (_, i) =>
      coords[i] && coords[i + 1]
        ? segmentLengthFeet(coords[i], coords[i + 1]).toFixed(2)
        : ''
    )
  );

  useEffect(() => {
    setInputs(
      Array.from({ length: N }, (_, i) =>
        coords[i] && coords[i + 1]
          ? segmentLengthFeet(coords[i], coords[i + 1]).toFixed(2)
          : ''
      )
    );
  }, [N, coords]);

  if (!feature) return null;

  const handleInputChange = (i, val) => {
    if (/^\d*\.?\d*$/.test(val)) {
      setInputs(inputs => inputs.map((v, idx) => idx === i ? val : v));
    }
  };

  const handleInputKeyDown = (i, e) => {
    if (e.key === 'Enter') {
      const newLength = parseFloat(inputs[i]);
      if (isNaN(newLength) || newLength <= 0) return;
      onSegmentLengthChange(i, newLength, () => {
        e.target.blur();
      });
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 85,
        right: 20,
        width: 260,
        height: 'calc(100vh - 150px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(255,255,255,0.97)',
        borderLeft: '1px solid #ccc',
        boxShadow: '-2px 0 8px rgba(0,0,0,0.07)',
        zIndex: 2000,
        fontSize: 13,
        padding: 12,
        overflow: 'hidden',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Edit Segments</h3>
      <ol style={{ paddingLeft: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {Array.from({ length: N }).map((_, i) => (
          <li
            key={i}
            className="edit-segment-item"
            style={{
              marginBottom: 10,
              borderRadius: 4,
              transition: 'background 0.2s'
            }}
            onMouseEnter={() => onSegmentHover(i)}
            onMouseLeave={onSegmentUnhover}
          >
            <strong>Segment {i + 1}:</strong>
            <input
              type="text"
              value={inputs[i]}
              style={{
                width: 70,
                marginLeft: 8,
                marginRight: 4,
                fontSize: 13,
                border: '1px solid #ccc',
                borderRadius: 3,
                padding: '2px 4px'
              }}
              onChange={e => handleInputChange(i, e.target.value)}
              onKeyDown={e => handleInputKeyDown(i, e)}
            />
            ft
          </li>
        ))}
      </ol>
    </div>
  );
};

export default Edit;