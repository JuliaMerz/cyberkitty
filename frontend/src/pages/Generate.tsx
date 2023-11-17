import React from 'react';
import Story from '../components/Story';
import {useParams} from 'react-router-dom';


const Generate: React.FC = () => {
  const {storyId} = useParams();
  return (
    <div>
      {storyId !== undefined ? (<Story storyId={parseInt(storyId)} />) : "please select a story"}
    </div>
  );
}

export default Generate;
