import React, {useState, useEffect} from 'react';
import ModifiableMarkdown from './ModifiableMarkdown'; // Assuming you have a LoadingComponent
import {CiText} from "react-icons/ci";
import {ChapterOutlineRead, SceneOutlineRead} from '../apiTypes';
import {Link} from 'react-router-dom';
import {VscDebug} from "react-icons/vsc";
import Markdown from 'react-markdown';
import Collapsible from "../components/Collapsible";
import SceneOutline from './SceneOutline'; // Assuming you have a SceneOutline component
import LoadingComponent from './LoadingComponent';
import {parseGenerator} from '../utils/parseGenerator';

type ChapterOutlineProps = {
  chapterOutlineId: number;
  inner?: boolean
  chapterOutlinePreview?: ChapterOutlineRead;
};

const ChapterOutline: React.FC<ChapterOutlineProps> = ({chapterOutlineId, inner, chapterOutlinePreview}) => {
  const [chapterOutline, setChapterOutline] = useState<ChapterOutlineRead | null>(chapterOutlinePreview || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [chunks, setChunks] = useState<[string, string][]>([['', '']]);
  const [textMode, setTextMode] = useState<boolean>(false);
  const [currentOutlineType, setCurrentOutlineType] = useState<string>('raw');

  const apiUrl = process.env.REACT_APP_API_URL;

  const fetchChapterOutline = async () => {
    try {
      const response = await fetch(`${apiUrl}/apiv1/data/chapter-outline/${chapterOutlineId}`);
      const data: ChapterOutlineRead = await response.json();
      setChapterOutline(data);
      if (data.current_scene_outlines.length > 0) {
        setCurrentOutlineType('outlines');
      }
    } catch (err) {
      setError('Failed to fetch chapter outline');
    }
  };

  const generateChapterOutline = async () => {
    if (loading) return;
    generateChapterOutlineForce();
  }
  const generateChapterOutlineForce = async () => {
    setError('');
    setLoading(true);
    try {
      await parseGenerator(`${apiUrl}/apiv1/generator/chapter-outline/${chapterOutlineId}`,
        (chunks: [string, string][]) => setChunks(chunks),
        (parsedData: ChapterOutlineRead) => setChapterOutline(parsedData));
    } catch (err) {
      console.log("Generator failure: ", err);
      setError('Failed to generate chapter outline');
    } finally {
      await fetchChapterOutline();
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChapterOutline();
  }, [chapterOutlineId]);

  const fieldUpdater = (field: string) => {
    return (value: string,) => {
      if (!chapterOutline) return;
      setChapterOutline({
        ...chapterOutline,
        [field]: value,
        modified: true,
      });
    };
  };
  const updateChapterOutlineCallback = async () => {
    if (chapterOutline) {
      const response = await fetch(`${apiUrl}/apiv1/data/chapter-outline/${chapterOutlineId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(chapterOutline)
      });
      if (response.status !== 200) {
        throw new Error('Error updating chapter');
      }
      const data = await response.json();
      setChapterOutline((prev: any) => ({
        ...prev,
        ...data
      }));
      return Promise.resolve();
    }
  }


  // old title
  //{`Scene Outline ${sceneOutline.scene_number}`}

  // TODO: This is an extremely plausible bug once we implement moving up and down.
  const toggleTextInner = (e: any, target: number) => {
    e.preventDefault();
    e.stopPropagation();
    setChapterOutline((prevChapterOutline: ChapterOutlineRead | null) => {
      if (prevChapterOutline === null) {
        return prevChapterOutline;
      }
      return {
        ...prevChapterOutline,
        current_scene_outlines: prevChapterOutline.current_scene_outlines.map((sceneOutline, i) => {
          if (i !== target) {
            return sceneOutline;
          }
          return {...sceneOutline, forceText: !((sceneOutline as any).forceText ?? false)}
        })
      };
    });

  }

  const outlineTypes = ['raw', 'improved'];

  const renderOutline = () => {
    if (loading) {
      return <LoadingComponent chunks={chunks} />;
    }

    // This setup for three step version of outlining process
    switch (currentOutlineType) {
      case 'raw':
        return <div className="wrapped">{chapterOutline?.raw ? <Markdown>{chapterOutline.raw}</Markdown> : "Click \"Generate Chapter Outline\" to create a chapter outline."}</div>;
      case 'improved':
        return <div className="wrapped">{chapterOutline?.improved ? (<Markdown>{"## Editing Notes \n" + chapterOutline?.edit_notes + "\n" + chapterOutline?.improved}</Markdown>) : "Click \"Generate Chapter Outline\" to create a chapter outline."}</div>;
      case 'outlines':
        console.log("chapterOutline: ", chapterOutline);
        console.log("chapterOutlinescenes: ", chapterOutline?.current_scene_outlines);
        if (chapterOutline?.current_scene_outlines.length === 0) {
          return <p>No scene outlines yet. Try generating some.</p>;
        }
        return chapterOutline?.current_scene_outlines?.map((sceneOutline, i) => (
          <Collapsible key={sceneOutline.id} title={(<h5>Scene {(sceneOutline as any).forceText ? "Text" : "Outline"} <Link to={`/debug/scene-outline/${sceneOutline.id}`}> <VscDebug /> </Link><a onClick={(e) => toggleTextInner(e, i)}><CiText /></a></h5>)} level={5}>
            <div className="wrapped">
              <SceneOutline inner={true} forceText={(sceneOutline as any).forceText} sceneOutlineId={sceneOutline.id} /></div>
          </Collapsible>
        ))

      default:
        return null;
    }
  };

  const toggleText = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setTextMode(!textMode);
  }

  if (textMode) {
    const wrapped = !inner ? "wrapped" : "";
    return (
      <div className={`${wrapped}`}>
        {((inner === undefined || !inner) &&
          <h4>Chapter Text <Link to={`/debug/chapter-outline/${chapterOutlineId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h4>)}
        {chapterOutline?.current_scene_outlines?.map((sceneOutline, i) => (
          <SceneOutline key={sceneOutline.id} inner={true} forceText={true} sceneOutlineId={sceneOutline.id} sceneOutlinePreview={sceneOutline} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="wrapped">
        {((inner === undefined || !inner) &&
          <h4>Chapter Outline <Link to={`/debug/chapter-outline/${chapterOutlineId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h4>)}
        <h6>Purpose</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('purpose')} saveCallback={updateChapterOutlineCallback}>{chapterOutline?.purpose}</ModifiableMarkdown>
        <h6>Summary</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('chapter_summary')} saveCallback={updateChapterOutlineCallback}>{chapterOutline?.chapter_summary}</ModifiableMarkdown>
        <h6>Main Events</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('main_events')} saveCallback={updateChapterOutlineCallback}>{chapterOutline?.main_events}</ModifiableMarkdown>
        <h6>Notes</h6>
        <ModifiableMarkdown editCallback={fieldUpdater('chapter_notes')} saveCallback={updateChapterOutlineCallback}>{chapterOutline?.chapter_notes}</ModifiableMarkdown>
        {/* Additional chapter outline details can be rendered here */}
        {chapterOutline?.modified ? <div className="modified-notice"><span>Modified... (consider regenerating)</span></div> : null}
        <button onClick={generateChapterOutline}>Generate Chapter Outline</button>
        {loading ? <button onClick={generateChapterOutlineForce}>Retry...</button> : null}
        {error && <p>Error: {error}</p>}
        {loading ? <p>Loading...</p> : null}
        {loading ? <LoadingComponent chunks={chunks} /> : (
          <div>
            <div>
              {outlineTypes.map(type => (
                <button key={type} onClick={() => setCurrentOutlineType(type)}>
                  {type}
                </button>
              ))}
              <button key={'outlines'} onClick={() => setCurrentOutlineType('outlines')}>
                <strong>Scene Outlines</strong>
              </button>
            </div>
            {renderOutline()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterOutline;

