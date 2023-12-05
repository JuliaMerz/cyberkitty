import React, {useState, useEffect} from 'react';
import ModifiableMarkdown from './ModifiableMarkdown'; // Assuming you have a LoadingComponent
import {SceneOutlineRead, SceneRead} from '../apiTypes';
import Markdown from 'react-markdown';
import {CiText} from "react-icons/ci";
import {Link} from 'react-router-dom';
import {VscDebug} from "react-icons/vsc";
import Collapsible from '../components/Collapsible';
import LoadingComponent from './LoadingComponent';
import {parseGenerator} from '../utils/parseGenerator';
import Scene from './Scene';

type SceneOutlineProps = {
  sceneOutlineId: number;
  inner?: boolean
  forceText?: boolean
  sceneOutlinePreview?: SceneOutlineRead;
};

const SceneOutline: React.FC<SceneOutlineProps> = ({sceneOutlineId, inner, sceneOutlinePreview, forceText}) => {
  const [sceneOutline, setSceneOutline] = useState<SceneOutlineRead | null>(sceneOutlinePreview || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [chunks, setChunks] = useState<[string, string][]>([['', '']]);
  const [textMode, setTextMode] = useState<boolean>(false);
  const [currentOutlineType, setCurrentOutlineType] = useState<string>('raw');

  const toggleText = (e: any) => {
    setTextMode(!textMode);
  }

  const apiUrl = process.env.REACT_APP_API_URL;

  const fetchSceneOutline = async () => {
    try {
      const response = await fetch(`${apiUrl}/apiv1/data/scene-outline/${sceneOutlineId}`);
      const data = await response.json();
      setSceneOutline(data);
      if (data.current_scene) {
        setCurrentOutlineType('outlines');
      }
    } catch (err) {
      setError('Failed to fetch scene outline');
    }
  };

  const generateSceneOutline = async () => {
    if (loading) return;
    generateSceneOutlineForce();
  }
  const generateSceneOutlineForce = async () => {
    setError('');
    setLoading(true);
    try {
      await parseGenerator(`${apiUrl}/apiv1/generator/scene-outline/${sceneOutlineId}`,
        (chunks: [string, string][]) => setChunks(chunks),
        (parsedData: SceneOutlineRead) => setSceneOutline(parsedData));
    } catch (err) {
      console.log("Generator failure: ", err);
      setError('Failed to generate scene outline');
    } finally {
      await fetchSceneOutline();
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSceneOutline();
  }, [sceneOutlineId]);

  const fieldUpdater = (field: string) => {
    return (value: string,) => {
      if (!sceneOutline) return;
      setSceneOutline({
        ...sceneOutline,
        [field]: value,
        modified: true,
      });
    };
  };
  const updateSceneOutlineCallback = async () => {
    if (sceneOutline) {
      const response = await fetch(`${apiUrl}/apiv1/data/scene-outline/${sceneOutlineId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sceneOutline)
      });
      if (response.status !== 200) {
        throw new Error('Error updating scene');
      }
      const data = await response.json();
      setSceneOutline((prev: any) => ({
        ...prev,
        ...data
      }));
      return Promise.resolve();
    }
  }



  const outlineTypes = ['raw', 'improved'];

  const renderOutline = () => {
    if (loading) {
      return <LoadingComponent chunks={chunks} />;
    }

    // This setup for three step version of outlining process
    switch (currentOutlineType) {
      case 'raw':
        return <div className="wrapped">{sceneOutline?.raw ? <Markdown>{sceneOutline.raw}</Markdown> : "Click \"Generate Scene Outline\" to create a chapter outline."}</div>;
      case 'improved':
        return <div className="wrapped">{sceneOutline?.improved ? (<Markdown>{"## Editing Notes \n" + sceneOutline?.edit_notes + "\n" + sceneOutline?.improved}</Markdown>) : "Click \"Generate Scene Outline\" to create a chapter outline."}</div>;
      case 'editable':
      case 'outlines':
        if (sceneOutline && sceneOutline?.current_scene === null) {
          return <p>No scene outlines yet. Try generating some.</p>;
        }
        return sceneOutline?.current_scene ?
          <Scene outline_mode={currentOutlineType == 'editable'} sceneId={sceneOutline.current_scene.id} scenePreview={sceneOutline.current_scene} inner={false} />
          : null

      default:
        return null;
    }
  };



  if (textMode || forceText) {
    console.log("inner", inner, forceText);
    const wrapped = !inner ? "wrapped" : "";
    return (
      <div>
        {sceneOutline?.current_scene ?
          (<div>
            {((inner === undefined || !inner) &&
              <h5>Scene Text <Link to={`/debug/scene-outline/${sceneOutlineId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h5>)}
            <div className={`${wrapped}`}>
              <Scene sceneId={sceneOutline.current_scene.id} scenePreview={sceneOutline.current_scene} inner={true} forceText={true} />
            </div>
          </div>)
          :
          <p>No scene generated for scene {sceneOutline?.scene_number}</p>}
      </div >);
  }

  const wrapped = !inner ? "wrapped" : "";
  return (
    <div>
      {((inner === undefined || !inner) &&
        <h5>Scene Outline <Link to={`/debug/scene-outline/${sceneOutlineId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h5>)}
      <div className={`${wrapped}`}>
        {/* Additional scene outline details can be rendered here */}
        <div>
          <h6>Scene Details</h6>
          <ModifiableMarkdown editCallback={fieldUpdater('summary')} saveCallback={updateSceneOutlineCallback}>{sceneOutline?.summary}</ModifiableMarkdown>
          <h6>Setting:</h6> <ModifiableMarkdown editCallback={fieldUpdater('setting')} saveCallback={updateSceneOutlineCallback}>{sceneOutline?.setting}</ModifiableMarkdown>
          <h6>Primary Function:</h6>
          <ModifiableMarkdown editCallback={fieldUpdater('primary_function')} saveCallback={updateSceneOutlineCallback}>{sceneOutline?.primary_function}</ModifiableMarkdown>
          <h6>Secondary Function:</h6>
          <ModifiableMarkdown editCallback={fieldUpdater('secondary_function')} saveCallback={updateSceneOutlineCallback}>{sceneOutline?.secondary_function}</ModifiableMarkdown>
          <h6>Context:</h6>
          <ModifiableMarkdown editCallback={fieldUpdater('context')} saveCallback={updateSceneOutlineCallback}>{sceneOutline?.context}</ModifiableMarkdown>
          {/* Render more details if necessary */}
        </div>
        {sceneOutline?.modified ? <div className="modified-notice"><span>Modified... (consider regenerating)</span></div> : null}
        <button onClick={generateSceneOutline}>Generate Scene Outline</button>
        {error && <p>Error: {error}</p>}
        {loading ? <button onClick={generateSceneOutlineForce}>Retry...</button> : null}
        {loading ? <p>Loading...</p> : null}
        {loading ? <LoadingComponent chunks={chunks} /> : (
          <div>
            <div>
              {outlineTypes.map(type => (
                <button key={type} onClick={() => setCurrentOutlineType(type)}>
                  {type}
                </button>
              ))}
              <button key={'editable'} onClick={() => setCurrentOutlineType('editable')}>
                <strong>Editable</strong>
              </button>
              <button key={'outlines'} onClick={() => setCurrentOutlineType('outlines')}>
                <strong>Scene Text</strong>
              </button>
            </div>
            {renderOutline()}
          </div>)
        }

      </div>
    </div>
  );
};

export default SceneOutline;


