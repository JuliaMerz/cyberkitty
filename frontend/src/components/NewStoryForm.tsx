import React from 'react';
import {useForm, SubmitHandler} from 'react-hook-form';
import {StoryCreate} from '../apiTypes';
import {useNavigate} from 'react-router-dom';

// Define the form's data structure
interface IFormInput {
  title: string;
  description: string;
  style: string;
  themes: string;
  specialRequests: string;
}

const NewStoryForm: React.FC = () => {
  const {register, handleSubmit, formState: {errors}} = useForm<IFormInput>();
  const [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<IFormInput> = async data => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL;
      console.log(process.env);

      const submit: StoryCreate = {
        title: data.title,
        description: data.description,
        style: data.style,
        themes: data.themes,
        request: data.specialRequests

      };
      const response = await fetch(`${apiUrl}/apiv1/data/story/`,
        {
          method: 'POST',
          body: JSON.stringify(submit),
          headers: {
            'Content-Type': 'application/json'
          }
        });

      const new_data = await response.json();
      if (response.status !== 200) {
        throw new Error('Error creating story');
      }
      navigate(`/generate/${new_data.id}`);
    } catch (error) {
      console.error('Error creating story:', error);
      setError('Error creating story');
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {error && <span>{error}</span>}
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" {...register("title", {required: true})} />
        {errors.description && <span>This field is required</span>}
      </div>

      <div>
        <label htmlFor="description">Description</label>
        <textarea id="description" {...register("description", {required: true})} />
        {errors.description && <span>This field is required</span>}
      </div>

      <div>
        <label htmlFor="style">Style</label>
        <textarea id="style" {...register("style", {required: true})} />
        {errors.style && <span>This field is required</span>}
      </div>

      <div>
        <label htmlFor="themes">Themes</label>
        <textarea id="themes" {...register("themes", {required: true})} />
        {errors.themes && <span>This field is required</span>}
      </div>

      <div>
        <label htmlFor="specialRequests">Special Requests</label>
        <textarea id="specialRequests" {...register("specialRequests")} />
      </div>

      <button type="submit">Create Story</button>
    </form>
  );
};

export default NewStoryForm;

