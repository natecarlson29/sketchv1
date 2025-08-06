import React from "react";

const History = ({ history, redoStack }) => (
  <div
    style={{
      position: 'absolute',
      top: 85,
      right: 20,
      width: 225,
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
    <style>
      {`
        .history-item:hover {
          background: #e6f0ff;
        }
      `}
    </style>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginTop: 0 }}>Undo History</h3>
      {history.length === 0 && <div style={{ color: '#888' }}>No actions yet.</div>}
      <ol style={{ paddingLeft: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {[...history].reverse().map((item, idx) => (
          <li
            key={idx}
            className="history-item"
            style={{ marginBottom: 10, borderRadius: 4, transition: 'background 0.2s' }}
          >
            <div>
              <strong>Type:</strong> {item.type}
            </div>
            <div>
              <strong>Feature ID:</strong> {item.featureId ? item.featureId.toString() : 'N/A'}
            </div>
            {'index' in item && (
              <div>
                <strong>Index:</strong> {item.index}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 20 }}>
      <h3 style={{ marginTop: 0 }}>Redo Stack</h3>
      {redoStack && redoStack.length === 0 && <div style={{ color: '#888' }}>No redo actions.</div>}
      <ol style={{ paddingLeft: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {redoStack && [...redoStack].reverse().map((item, idx) => (
          <li key={idx} style={{ marginBottom: 10 }}>
            <div>
              <strong>Type:</strong> {item.type}
            </div>
            <div>
              <strong>Feature ID:</strong> {item.featureId ? item.featureId.toString() : 'N/A'}
            </div>
            {'index' in item && (
              <div>
                <strong>Index:</strong> {item.index}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  </div>
);

export default History;