import React, {useState, useEffect} from 'react';
import Markdown from 'react-markdown';
import {FiChevronLeft, FiChevronRight} from "react-icons/fi";


// TODO allow naming fo the midpoint chunks

type LoadingComponentProps = {
  chunks: [string, string][];
}

const LoadingComponent: React.FC<LoadingComponentProps> = ({chunks}) => {

  const [currentChunk, setCurrentChunk] = useState<number>(-1);

  //   useEffect(() => {
  //     if (currentChunk === -1) {
  //       setCurrentChunk(chunks.length - 1);
  //     }
  //   }, [chunks.length, currentChunk]);

  // Navigate to the previous chunk
  const goToPrevious = () => {
    setCurrentChunk(current => (current > 0 ? current - 1 : 0));
  };

  // Navigate to the next chunk
  const goToNext = () => {
    setCurrentChunk(current => (current < chunks.length - 1 ? current + 1 : -1));
  };

  if (currentChunk > chunks.length - 1) {
    setCurrentChunk(chunks.length - 1);
  }

  // Determine the chunk to display
  const displayedChunk = (currentChunk === -1 || currentChunk > chunks.length - 1) ? chunks[chunks.length - 1][1] : chunks[currentChunk][1];

  const displayIndex = currentChunk === -1 ? chunks.length - 1 : currentChunk;
  const displayLabel = chunks[displayIndex][0];




  return (
    <div className="loading-component">
      <div className="loading-arrows">
        <button onClick={goToPrevious}><FiChevronLeft /></button>
        <label>{displayIndex + 1} of {chunks.length}</label>
        <button onClick={goToNext}><FiChevronRight /></button>
        <label>{displayLabel}</label>
      </div>
      <Markdown>{displayedChunk}</Markdown>
    </div>

  )
}

export default LoadingComponent;
