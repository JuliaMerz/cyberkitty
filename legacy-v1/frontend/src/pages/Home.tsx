import React, {useState} from 'react';
import Modal from '../components/Modal';
import NewStoryForm from '../components/NewStoryForm';
import {StoryRead} from '../apiTypes';

const Home: React.FC = () => {
  const [isModalOpen, setModalOpen] = useState(false);
  const [userStories, setUserStories] = useState<StoryRead[]>([]);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <div>
      <h2>Welcome to CyberKitty</h2>
      <div>
        <p>CyberKitty is an experimental long form text editor combining human storytelling
          with AI assistance. Programmers build on top of decades of technological
          improvements to make their work faster. CyberKitty lets writers do the same.</p>
        <p>This PoC of CyberKitty is tuned specifically for writing fiction novels.</p>
        <p>Writing a novel normally takes an experienced writer a year. Building
          the skillset to even manage a writing project that large usually takes
          a few failed novels over half a decade. How much better can we do with AI support?</p>

      </div>

      <div className="home-button"><p><button onClick={openModal}>Draft Your First Novel </button></p></div>
      <div className="home-notice">
        <p>Note: While CyberKitty <b>can</b> draft a novel entirely on its own, it's best
          seen as an assistant, rather than a full on generator. AI is powerful, but
          it's not a (full) substitute for artistic intention or practice or taste.</p>
        <p>Unique ideas and stories worth telling are still the most important ingredients
          in good writing. CyberKitty is here to help you get to the good stuff faster.</p>
      </div>
      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <NewStoryForm />
      </Modal>

    </div >
  );
};

export default Home;


