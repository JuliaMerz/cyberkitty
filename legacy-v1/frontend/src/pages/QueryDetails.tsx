import React, {useState, useEffect} from 'react';
import {useParams} from 'react-router-dom';
import {CodeBlock} from "react-code-blocks";
import {useNavigate} from 'react-router-dom';
import Collapsible from "../components/Collapsible";
import {StoryRead, StoryOutlineRead, ChapterOutlineRead, SceneOutlineRead, Scene, QueryRead} from '../apiTypes';
import {IoReturnUpBack} from "react-icons/io5";

const QueryDetails = () => {
  const {storyId} = useParams<{storyId: string}>();
  const {model} = useParams<{model: string}>();
  const [showInputMessages, setShowInputMessages] = useState<{[ind: string]: boolean}>({});
  const [obj, setObj] = useState<any>(null); // Replace 'any' with the appropriate type
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const apiUrl = process.env.REACT_APP_API_URL;
  useEffect(() => {
    const fetchStoryQueries = async () => {
      try {
        console.log("fetching");
        const response = await fetch(`${apiUrl}/apiv1/data/${model}/${storyId}/queries`);
        if (response.status !== 200) {
          throw new Error('Error fetching story queries');
        }

        setObj(await response.json());
      } catch (err) {
        setError('Failed to load story queries');
      } finally {
        setLoading(false);
      }
    };

    fetchStoryQueries();
  }, [storyId]);

  // Function to toggle visibility of input messages
  const toggleInputMessages = (apiCallIndex: number) => {
    setShowInputMessages((prevShowInputMessages: object) => {
      const newShowInputMessages: {[ind: string]: boolean} = {...prevShowInputMessages};
      newShowInputMessages[apiCallIndex.toString()] = !(newShowInputMessages[apiCallIndex.toString()] ?? false);
      return newShowInputMessages;
    });
  };


  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;
  console.log("obj: ", obj);

  const goBack = () => {
    navigate(-1);
  };

  return (
    <div>
      <h1>{model}: {obj.title} <a onClick={goBack}><IoReturnUpBack /></a></h1>
      {/* Display other story details */}
      <div>
        <h2>Queries</h2>
        <div>
          <strong>Total Cost: </strong> {obj.queries.reduce((acc: number, query: QueryRead) => acc + query.total_cost, 0)}

        </div>
        {obj !== null && obj.queries.map((query: QueryRead, index: number) => (
          <div className="wrapped" key={index}>
            <Collapsible title={`Query ${query.updated_on}`} level={3} >
              <div>Total Cost: {query.total_cost}</div>
              <div>Original Prompt:
                <CodeBlock
                  text={query.original_prompt}
                  language="markdown"
                /></div>
              <div>System Prompt: <CodeBlock
                text={(query as any).system_prompt}
                language="markdown"
              /></div>
              <div>Complete Output: <CodeBlock
                text={query.complete_output}
                language="markdown"
              /></div>
              {/* List of API Calls */}
              <div>
                <Collapsible title="API Calls" level={4} >
                  {query.api_calls.map((apiCall, apiIndex) => (
                    <div className="wrapped" key={apiIndex}>
                      <div>Timestamp: {apiCall.timestamp}</div>
                      <div>Success: {apiCall.success ? 'Yes' : 'No'}</div>
                      <div>Error: {apiCall.error || 'None'}</div>
                      <div>Cost: {apiCall.cost}</div>
                      <Collapsible title="Input Messages" level={5} >
                        <div>
                          {apiCall.input_messages.map((message, messageIndex) => (
                            <div className="wrapped" key={messageIndex}>
                              <strong>Role:</strong> {message.role}

                              <CodeBlock
                                text={message.content}
                                language="markdown"
                              /></div>
                          ))}
                        </div>
                      </Collapsible>
                      <div>Output: <CodeBlock
                        text={apiCall.output}
                        language="markdown"
                      /></div>

                    </div>
                  ))}
                </Collapsible>
              </div>
              <div>Total Cost: {query.total_cost}</div>
            </Collapsible>
          </div>
        ))
        }
      </div >
    </div >
  );
};

export default QueryDetails;

