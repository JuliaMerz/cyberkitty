import React, {useState, useEffect} from 'react';
import {SceneRead} from '../apiTypes';
import Markdown from 'react-markdown';
import {CiText} from "react-icons/ci";
import {Link} from 'react-router-dom';
import {VscDebug} from "react-icons/vsc";
import LoadingComponent from './LoadingComponent'; // Assuming you have a LoadingComponent
import ModifiableMarkdown from './ModifiableMarkdown'; // Assuming you have a LoadingComponent
import {parseGenerator} from '../utils/parseGenerator';

type SceneProps = {
  sceneId: number;
  outline_mode?: boolean
  inner?: boolean
  scenePreview?: SceneRead;
  forceText?: boolean
};

const Scene: React.FC<SceneProps> = ({sceneId, inner, scenePreview, forceText, outline_mode}) => {
  const [scene, setScene] = useState<SceneRead | null>(scenePreview || null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [chunks, setChunks] = useState<[string, string][]>([['', '']]);
  const [textMode, setTextMode] = useState<boolean>(false);
  const [currentOutlineType, setCurrentOutlineType] = useState<string>('raw');

  const toggleText = () => {
    setTextMode(!textMode);
  }

  const apiUrl = process.env.REACT_APP_API_URL;

  const fetchScene = async () => {
    try {
      const response = await fetch(`${apiUrl}/apiv1/data/scene/${sceneId}`);
      setScene(await response.json());
    } catch (err) {
      setError('Failed to fetch scene');
    }
  };

  const generateScene = async () => {
    if (loading) return;
    generateSceneForce();
  }
  const generateSceneForce = async () => {
    setError('');
    setLoading(true);
    try {
      await parseGenerator(`${apiUrl}/apiv1/generator/scene/${sceneId}`,
        (chunks: [string, string][]) => setChunks(chunks),
        (parsedData: SceneRead) => setScene(parsedData));
    } catch (err) {
      console.log("Generator failure: ", err);
      setError('Failed to generate scene');
    } finally {
      await fetchScene();
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScene();
  }, [sceneId]);





  const outlineTypes = ['raw', 'improved'];

  const textEditCallback = (text: string) => {
    setScene((prevScene: SceneRead | null) => {
      if (prevScene) {
        return {...prevScene, final_text: text};
      }
      return prevScene;
    });
  }

  const outlineEditCallback = (text: string) => {
    setScene((prevScene: SceneRead | null) => {
      if (prevScene) {
        return {...prevScene, outline: text};
      }
      return prevScene;
    });
  }

  const updateSceneCallback = async () => {
    if (scene) {
      const response = await fetch(`${apiUrl}/apiv1/data/scene/${sceneId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scene)
      });
      if (response.status !== 200) {
        throw new Error('Error updating scene');
      }
      const data = await response.json();
      setScene(data);
      return Promise.resolve();
    }
  }

  if (outline_mode) {
    return <div className="wrapped"><ModifiableMarkdown editCallback={outlineEditCallback} saveCallback={updateSceneCallback}>{scene?.outline}</ModifiableMarkdown></div>
  }

  const renderOutline = () => {
    if (loading) {
      return <LoadingComponent chunks={chunks} />;
    }

    // This setup for three step version of writing process
    switch (currentOutlineType) {
      case 'raw':
        return <div className="lo-head">{scene?.raw ? <Markdown>{scene?.raw}</Markdown> : "Click \"Generate New Draft\" to generate text for the scene."}</div>;
      case 'improved':
        return <div className="lo-head">{scene?.improved ? <Markdown>{"## Editing Notes \n" + scene?.edit_notes + "\n" + scene?.improved}</Markdown> : "Click \"Generate New Draft\" to generate text for the scene."}</div>;
      case 'final':
        return <div className="lo-head"><ModifiableMarkdown editCallback={textEditCallback} saveCallback={updateSceneCallback}>{scene?.final_text !== undefined ? scene.final_text : ''}</ModifiableMarkdown></div>

      default:
        return null;
    }
  };

  if (textMode || forceText) {
    const wrapped = !inner ? "wrapped" : "";
    return (
      <div>
        {((inner === undefined || !inner) &&
          (<h5>Scene <Link to={`/debug/scene/${sceneId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h5>))}
        <div className={`${wrapped}`}>

          {scene?.final_text ? <Markdown>{scene?.final_text}</Markdown > : <p><strong>[No text generated for scene {scene?.scene_number}]</strong></p>
          }
        </div></div>
    );
  }

  return (
    <div>

      <div className="wrapped">
        {((inner === undefined || !inner) &&
          (<h5>Scene <Link to={`/debug/scene/${sceneId}`}> <VscDebug /> </Link><a onClick={toggleText}><CiText /></a></h5>))}
        {scene?.improved !== '' ? <p>Try editing the outline with the "Editable" button above, then generate the scene text with "Generate New Draft".</p> : null}
        <button onClick={generateScene}>Generate New Draft</button>
        {loading ? <button onClick={generateSceneForce}>Retry...</button> : null}
        {error && <p>Error: {error}</p>}
        {loading ? <p>Loading...</p> : null}
        <div>
          {loading ? <LoadingComponent chunks={chunks} /> : (<div>
            {
              outlineTypes.map(type => (
                <button key={type} onClick={() => setCurrentOutlineType(type)}>
                  {type}
                </button>
              ))
            }
            <button key={'editable'} onClick={() => setCurrentOutlineType('final')}>
              <strong>Editable</strong>
            </button>

            {renderOutline()}
          </div>)}
        </div>

      </div>
    </div >
  );
};

export default Scene;

