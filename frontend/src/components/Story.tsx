import React, {useState, useEffect} from 'react';
import axios from 'axios';
import {createParser, type ParsedEvent, type ReconnectInterval} from 'eventsource-parser';
import {StoryRead} from '../apiTypes'; // Import the Story type

type StoryProps = {
  storyId: number;
};

const Story: React.FC<StoryProps> = ({storyId}) => {
  const [story, setStory] = useState<StoryRead | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const fetchStory = async () => {
    try {
      const response = await axios.get<StoryRead>(`http://localhost:8000/story/${storyId}`);
      setStory(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch story');
      setLoading(false);
    }
  };

  const generateStory = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`http://localhost:8000/generate/story/${storyId}`, {
        responseType: 'stream'
      });

      const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          // Parse the event and update the state
          const parsedData = JSON.parse(event.data);
          setStory(parsedData);  // Assuming the data structure matches StoryRead
        }
      });

      for await (const chunk of response.data) {
        parser.feed(chunk);
      }
    } catch (err) {
      setError('Failed to generate story');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStory();
  }, [storyId]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <>
        <h1>{story?.title}</h1>
        <p><strong>Description:</strong> {story?.description}</p>
        <p><strong>Style:</strong> {story?.style}</p>
        <p><strong>Themes:</strong> {story?.themes}</p>
        <p><strong>Setting:</strong> {story?.setting}</p>
        <p><strong>Main Characters:</strong> {story?.main_characters}</p>
        <p><strong>Summary:</strong> {story?.summary}</p>
        <p><strong>Author ID:</strong> {story?.author_id}</p>
        <p><strong>Is Public:</strong> {story?.is_public ? 'Yes' : 'No'}</p>
        <p><strong>Created On:</strong> {story?.created_on}</p>
        <p><strong>Updated On:</strong> {story?.updated_on}</p>

        {/* Render the StoryOutline component here, once available */}
        {story?.current_story_outline && (
          {/* <StoryOutline outlineId={story.current_story_outline.id} /> */}
        )}

        <button onClick={generateStory}>Generate</button></>
    </div>
  );

};

export default Story;

