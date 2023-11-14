import React, {useEffect} from 'react';
import axios from 'axios';
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import Navbar from './components/Navbar';
import Title from './components/Title';

import Home from './pages/Home';
import Generate from './pages/Generate';
import Read from './pages/Read';

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

axios.interceptors.response.use((response) => {
  return response;
}, async (error) => {
  if (localStorage.getItem('token') === null) {
    return Promise.reject(error);
  }
  const originalRequest = error.config;
  if ((error.response.status === 401 || error.response.status === 403) && !originalRequest._retry) {
    originalRequest._retry = true;

    try {

      const newAccessToken = await refreshAccessToken();

      // Update the token in the original request and retry it
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
      return axios(originalRequest);
    } catch (refreshError) {
      // Handle failed refresh here (e.g., redirect to login)
      return Promise.reject(refreshError);
    }
  }
  return Promise.reject(error);
});

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/refresh`, {refreshToken});
  localStorage.setItem('token', response.data.access_token);
  return response.data.access_token;
};



const App: React.FC = () => {

  useEffect(() => {
    const existingToken = localStorage.getItem('token');
    if (!existingToken) {
      fetchToken();
    }
  }, []);


  const fetchToken = async () => {
    if (process.env.NODE_ENV === 'development') {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/auth/dev_ping`);
        const token = response.data.access_token;
        const refreshToken = response.data.refresh_token;
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
      } catch (error) {
        console.error('Error fetching token:', error);
      }
    }
  };

  return (
    <Router>
      <div className="container">
        <nav className="box navbar">
          <Navbar />
        </nav>
        <header className="box title">
          <Title />
        </header>
        <main className="box content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/generate/:storyId" element={<Generate />} />
            <Route path="/view/:storyId" element={<Read />} />
            {/* <Route path="/about" element={<About/>} /> */}
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
