import React, { useState } from 'react';
import Modal from '../map-helpers/Modal';
import { CurveIcon } from '../svg';

const CurvatureTool = ({ onAddCurve, enabled }) => {
  const [open, setOpen] = useState(false);
  const [rise, setRise] = useState('');
  const [run, setRun] = useState('');
  const [bulge, setBulge] = useState('');

  const handleOk = () => {
    const r = parseFloat(rise);
    const n = parseFloat(run);
    const b = parseFloat(bulge);
    if (isNaN(r) || isNaN(n) || isNaN(b)) return;
    setOpen(false);
    console.log('CurvatureTool handleOk', r, n, b);
    onAddCurve(r, n, b);
    setRise(''); setRun(''); setBulge('');
  };

  return (
    <>
      <button
        className={`map-button${enabled ? '' : ' disabled'}`}
        title="Add Curved Segment"
        onClick={() => enabled && setOpen(true)}
        disabled={!enabled}
      >
        <CurveIcon />
      </button>
      <Modal
        open={open}
        message={
          <div>
            <div style={{ marginBottom: 12 }}>Add Curved Segment</div>
            <div>
              <label>Rise: <input type="number" value={rise} onChange={e => setRise(e.target.value)} /></label>
            </div>
            <div>
              <label>Run: <input type="number" value={run} onChange={e => setRun(e.target.value)} /></label>
            </div>
            <div>
              <label>Bulge: <input type="number" value={bulge} onChange={e => setBulge(e.target.value)} /></label>
            </div>
          </div>
        }
        onClose={() => {
          setOpen(false);
          handleOk();
        }}
      >
      </Modal>
    </>
  );
};

export default CurvatureTool;