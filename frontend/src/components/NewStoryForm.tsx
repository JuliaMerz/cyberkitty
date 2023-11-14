import React from 'react';
import {useForm, SubmitHandler} from 'react-hook-form';
import axios from 'axios';
import {useNavigate} from 'react-router-dom';

// Define the form's data structure
interface IFormInput {
  description: string;
  style: string;
  themes: string;
  specialRequests: string;
}

const NewStoryForm: React.FC = () => {
  const {register, handleSubmit, formState: {errors}} = useForm<IFormInput>();
  const navigate = useNavigate();

  const onSubmit: SubmitHandler<IFormInput> = async data => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL;
      console.log(process.env);
      const response = await axios.post(`${apiUrl}/apiv1/data/story/`, data);
      navigate(`/generate/${response.data.id}`);
    } catch (error) {
      console.error('Error creating story:', error);
      // Handle error
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
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

