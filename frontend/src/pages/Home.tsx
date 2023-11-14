import React, {useState} from 'react';
import Modal from '../components/Modal';
import NewStoryForm from '../components/NewStoryForm';

const Home: React.FC = () => {
  const [isModalOpen, setModalOpen] = useState(false);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <div>
      <h2>Welcome to Our Story Generator</h2>
      <p>Description of the application...</p>
      <button onClick={openModal}>Generate a New Story</button>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <NewStoryForm />
      </Modal>

      {/* Placeholder for Gallery of Published Work */}
      <div className="gallery-placeholder">
        <p>Gallery coming soon...</p>
      </div>
    </div>
  );
};

export default Home;


