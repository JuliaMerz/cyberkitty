import React, {useState, useEffect} from 'react';
import {Link} from 'react-router-dom';
import {VscDebug} from "react-icons/vsc";
import {StoryOutlineRead, ChapterOutlineRead} from '../apiTypes';
import Markdown from 'react-markdown';
import Collapsible from "../components/Collapsible";
import ChapterOutline from './ChapterOutline'; // Assuming you have a ChapterOutline component
import LoadingComponent from './LoadingComponent'; // Your loading component
import {parseGenerator} from '../utils/parseGenerator'; // Assuming this is your generator parsing utility

type StoryOutlineProps = {
  storyOutlineId: number;
};

const StoryOutline: React.FC<StoryOutlineProps> = ({storyOutlineId}) => {
  const [storyOutline, setStoryOutline] = useState<StoryOutlineRead | null>(null);
  const [currentOutlineType, setCurrentOutlineType] = useState<string>('onesentence');
  const [loading, setLoading] = useState<boolean>(false);
  const [fetching, setFetching] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [chunks, setChunks] = useState<[string, string][]>([['', '']]);

  const apiUrl = process.env.REACT_APP_API_URL;

  const fetchStoryOutline = async () => {
    try {
      setFetching(true);

      const response = await fetch(`${apiUrl}/apiv1/data/story-outline/${storyOutlineId}`);
      const data: StoryOutlineRead = await response.json();
      setStoryOutline(data);
      if (data.current_chapter_outlines.length > 0) {
        setCurrentOutlineType('outlines');
      }
      setFetching(false);
    } catch (err) {
      setError('Failed to fetch story outline');
      setFetching(false);
    }
  };

  const generateOutline = async () => {
    if (loading)
      return;
    setError('');
    setLoading(true);
    try {
      await parseGenerator(`${apiUrl}/apiv1/generator/story-outline/${storyOutlineId}`,
        (chunks: [string, string][]) => setChunks(chunks),
        (parsedData: StoryOutlineRead) => setStoryOutline(parsedData));
    } catch (err) {
      console.log("Generator failure: ", err);
      setError('Failed to generate outline');
    } finally {
      await fetchStoryOutline();
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStoryOutline();
  }, [storyOutlineId]);

  const outlineTypes = ['onesentence', 'mainevents_raw', 'mainevents_improved'];

  const renderOutline = () => {
    if (loading) {
      return <LoadingComponent chunks={chunks} />;
    }

    // This setup for three step version of outlining process
    switch (currentOutlineType) {
      case 'onesentence':
        return <Markdown>{storyOutline?.outline_onesentence}</Markdown>;
      case 'mainevents_raw':
        return <Markdown>{storyOutline?.outline_mainevents_raw}</Markdown>;
      case 'mainevents_improved':
        return <Markdown>{"## Editing Notes \n" + storyOutline?.editing_notes + "\n" + storyOutline?.outline_mainevents_improved}</Markdown>;
      case 'paragraphs':
        return <Markdown>{storyOutline?.outline_paragraphs}</Markdown>;
      case 'outlines':
        return <div>
          <h2>Current Chapter Outlines</h2>
          {storyOutline?.current_chapter_outlines?.length === 0 ? <p>No chapter outlines yet. Generate a story outline first!</p> : null}
          {storyOutline?.current_chapter_outlines?.sort((a, b) => a.chapter_number - b.chapter_number).map((chapterOutline: ChapterOutlineRead) => (
            <Collapsible key={chapterOutline.id} title={chapterOutline.chapter_number + " — " + chapterOutline.title} level={3}>
              <ChapterOutline key={chapterOutline.id} chapterOutlineId={chapterOutline.id} chapterOutlinePreview={chapterOutline} />
            </Collapsible>
          ))}

        </div>
      default:
        return null;
    }
  };

  return (
    <div>
      <h1>Story Outline <Link to={`/debug/story-outline/${storyOutlineId}`}> <VscDebug /> </Link></h1>
      {error && <p>Error: {error}</p>}
      <button onClick={generateOutline}>Generate Outline</button>
      <div>
        {fetching ? <p>Loading...</p> : null}
        {outlineTypes.map(type => (
          <button key={type} onClick={() => setCurrentOutlineType(type)}>
            {type}
          </button>
        ))}
        <button key={'outlines'} onClick={() => setCurrentOutlineType('outlines')}>
          <strong>Chapter Outlines</strong>
        </button>
      </div>
      {renderOutline()}
    </div>
  );
};

export default StoryOutline;

