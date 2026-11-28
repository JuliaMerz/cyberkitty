import React, {useState, useEffect} from 'react';
import MDEditor from '@uiw/react-md-editor';
import Markdown from 'react-markdown';
import {FiEdit} from "react-icons/fi"; // Importing edit icon

type ModifiableMarkdownProps = {
  children: string | undefined;
  editCallback: (text: string) => void;
  saveCallback: () => Promise<void>;
};

const ModifiableMarkdown: React.FC<ModifiableMarkdownProps> = ({children, editCallback, saveCallback}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');


  const handleSave = async () => {
    saveCallback().then(() => {
      setIsEditing(false);
      setError('');
    }).catch(() => {
      setError('Failed to save changes');
    });
  };

  const handleEdit = (value: string | undefined) => {
    if (value === undefined) return;
    editCallback(value);
  }

  return (
    <div data-color-mode="light" className="modifiable-markdown" onClick={() => setIsEditing(true)} onBlur={handleSave} style={{position: 'relative'}}>
      {isEditing && children !== undefined ? (
        <MDEditor
          value={children}
          onChange={handleEdit}
          preview={'edit'}
          hideToolbar={true}
          visibleDragbar={false}
          height={'100%'}
        />
      ) : (
        <>
          <Markdown>{children}</Markdown>
          <div className="edit-icon" onClick={() => setIsEditing(true)}>
            <FiEdit />
          </div>
        </>
      )}
      {error && <p style={{color: 'red'}}>{error}</p>}
    </div>
  );
};

export default ModifiableMarkdown;

