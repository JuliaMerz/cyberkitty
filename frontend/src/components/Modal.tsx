import React from 'react';
import './modal.css'; // Import the CSS for styling

interface ModalProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
}

const Modal: React.FC<ModalProps> = ({children, isOpen, onClose}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {children}
        <button className="close-button" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default Modal;

