import React from 'react';
import Modal from './Modal';

const Controls = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    message={
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Controls & Hotkeys</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1,
              marginLeft: 16
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <hr />
        <h3>Dimension Textbox</h3>
        <ul>
          <li><b>Feet:</b> Enter a number (e.g. <code>10</code>) to draw a segment 10 feet long in the current direction.</li>
          <li><b>Angle:</b> Use <code>length/angle</code> (e.g. <code>10/90</code>) to draw 10 feet at 90°.</li>
          <li><b>Direction notation:</b> Use <code>R10+U5</code> for 10 feet right, then 5 feet up.</li>
        </ul>
        <h3>Hotkeys</h3>
        <ul>
          <li><b>Arrow keys:</b> Add segment in arrow direction using feet defined in Dimension textbox</li>
          <li><b>Enter:</b> Add segment using textbox value</li>
          <li><b>A:</b> Finish polygon</li>
          <li><b>Ctrl+Z:</b> Undo</li>
          <li><b>Ctrl+Y:</b> Redo</li>
          <li><b>Ctrl+R:</b> Rotate map to highlighted segment</li>
          <li><b>Holding Alt:</b> Disable snapping</li>
        </ul>
      </div>
    }
  />
);

export default Controls;