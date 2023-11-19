import React, {useState, useEffect} from 'react';
import ModifiableMarkdown from './ModifiableMarkdown'; // Assuming you have a LoadingComponent
import {Link} from 'react-router-dom';
import {StoryRead} from '../apiTypes'; // Import the Story type
import {PartialEvent, ParsedEvent, ReconnectInterval} from '../utils/eventTypes';
import {createParser, streamAsyncIterator} from '../utils/parseStream';
import {VscDebug} from "react-icons/vsc";
import LoadingComponent from './LoadingComponent';
import StoryOutline from './StoryOutline';
import Markdown from 'react-markdown';
import {parseGenerator} from '../utils/parseGenerator';

type StoryProps = {
  storyId: number;
};

const Story: React.FC<StoryProps> = ({storyId}) => {
  const [story, setStory] = useState<StoryRead | null>(null);
  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [chunks, setChunks] = useState<[string, string][]>([['', '']]);
  const [error, setError] = useState<string>('');


  const apiUrl = process.env.REACT_APP_API_URL;
  const fetchStory = async () => {
    try {
      const response = await fetch(`${apiUrl}/apiv1/data/story/${storyId}`);

      setStory(await response.json());
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch story');
      setLoading(false);
    }
  };

  const generateStory = async () => {
    if (loading) {
      return;
    }
    setLoading(true);
    try {

      await parseGenerator(`${apiUrl}/apiv1/generator/story/${storyId}`,
        (chunks: [string, string][]) => setChunks(chunks),
        (parsedData: StoryRead) => setStory(parsedData));

      //Compensate for SQLAlchemy limitations


    } catch (err) {
      console.log("Fgen failure: ", err);
      setError('Failed to generate story');
    } finally {
      console.log("Finally");
      await fetchStory();
      setLoading(false);
    }
  };

  const fieldUpdater = (field: string, generated: boolean) => {
    return (value: string,) => {
      if (!story) return;
      if (generated) {
        setStory({
          ...story,
          [field]: value,
          modified_generated: true,
        });
        return;
      }
      setStory({
        ...story,
        [field]: value,
        modified: true,
      });
    };
  };

  const updateStoryCallback = async () => {
    if (story) {
      const response = await fetch(`${apiUrl}/apiv1/data/story/${storyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(story)
      });
      if (response.status !== 200) {
        throw new Error('Error updating story');
      }
      const data = await response.json();
      setStory((prev: any) => ({
        ...prev,
        ...data
      }));
      return Promise.resolve();
    }
  }


  function renderGenerated() {
    if (loading) {
      return (
        <LoadingComponent chunks={chunks} />
      );
    }

    return (<>

      <h6>Setting:</h6>
      <ModifiableMarkdown editCallback={fieldUpdater('setting', true)} saveCallback={updateStoryCallback}>{story?.setting}</ModifiableMarkdown>
      <h6>Main Characters:</h6>
      <ModifiableMarkdown editCallback={fieldUpdater('main_characters', true)} saveCallback={updateStoryCallback}>{story?.main_characters}</ModifiableMarkdown>
      <h6>Summary:</h6>
      <ModifiableMarkdown editCallback={fieldUpdater('summary', true)} saveCallback={updateStoryCallback}>{story?.summary}</ModifiableMarkdown>
      {story?.modified_generated ? <div className="modified-notice"><span>Modified... (consider regenerating)</span></div> : null}

    </>);



  }
  useEffect(() => {
    fetchStory();
  }, [storyId]);

  console.log(story?.current_story_outline);
  return (
    <div>
      <>
        <h1>{story ? story.title : "Loading..."}<Link to={`/debug/story/${storyId}`}> <VscDebug /> </Link></h1>

        <p><i> {story?.is_public ? 'Public' : 'Private'}</i></p>
        <h6>Description:</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('description', false)} saveCallback={updateStoryCallback}>{story?.description}</ModifiableMarkdown>
        <h6>Style:</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('style', false)} saveCallback={updateStoryCallback}>{story?.style}</ModifiableMarkdown>
        <h6>Themes:</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('themes', false)} saveCallback={updateStoryCallback}>{story?.themes}</ModifiableMarkdown>
        <h6>Special Requests:</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('request', false)} saveCallback={updateStoryCallback}>{story?.request}</ModifiableMarkdown>
        {story?.modified ? <div className="modified-notice"><span>Modified... (consider regenerating)</span></div> : null}
        <button onClick={generateStory}>Generate</button>
        {loading ? <p>Loading...</p> : null}
        {error ? (<p>Error: {error}</p>) : null}
        {renderGenerated()}

        {/* Render the StoryOutline component here, once available */}
        {
          story?.current_story_outline && (
            <StoryOutline storyOutlineId={story.current_story_outline.id} />
          )
        }
      </>
    </div >
  );

};

export default Story;

