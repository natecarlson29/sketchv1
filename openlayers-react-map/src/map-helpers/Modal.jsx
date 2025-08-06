import React from 'react';

const Modal = ({ message, open, onClose }) => {
  if (!open) return null;

  return (
    <div className="custom-modal-overlay" onClick={onClose}>
      <div className="custom-modal" onClick={e => e.stopPropagation()}>
        <div className="custom-modal-message">{message}</div>
        <button
          className="custom-modal-ok"
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default Modal;