import React, {useState} from 'react';
import Modal from '../components/Modal';
import NewStoryForm from '../components/NewStoryForm';

const Home: React.FC = () => {
  const [isModalOpen, setModalOpen] = useState(false);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <div>
      <h2>Welcome to CyberKitty</h2>
      <p>Writing a novel normally takes an experienced writer a year. Getting
        the skillset to even manage a writing project that large usually takes
        a few failed novels. What if AI could make that process easier and faster?</p>
      <p>CyberKitty is an experimental novel editor combining your storytelling
        with AI assistance. Programmers build on top of decades of technological
        improvements to make their work faster. Now we can do the same with
        stories.</p>
      <button onClick={openModal}>Draft Your First Novel </button>
      <p>Note: While CyberKitty <i>can</i> draft a novel on its own it's best
        seen as an assistant rather than a full on generator. AI is powerful, but
        it's not a (full) substitute for artistic intention or practice or taste.</p>
      <p>Unique ideas and stories worth telling are still the most important ingredients
        in good writing. CyberKitty is here to help you get to the good stuff faster.</p>

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


