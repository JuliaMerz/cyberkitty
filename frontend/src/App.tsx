import React, {useEffect} from 'react';
import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import Navbar from './components/Navbar';
import Title from './components/Title';

import {CreateInterceptors} from './utils/refreshInterceptor';

import Home from './pages/Home';
import Generate from './pages/Generate';
import Read from './pages/Read';
import QueryDetails from './pages/QueryDetails';

import fetchIntercept from 'fetch-intercept';

// const unregister = fetchIntercept.register({
//   request: function (url, config) {
//     return [url, config];
//   },

//   requestError: function (error) {
//     // Called when an error occured during another 'request' interceptor call
//     return Promise.reject(error);
//   },
// });

//   response: function (response) {
//     // Modify the reponse object
//     console.log("hmm", response.request.headers.get('Authorization'), response.headers.get('Authorization'));
//     console.log("intercepting request error: ", error);
//     console.log("intercepting request error—the request: ", error.request);
//     const originalRequest = response.request;
//     if ((response.status === 401 || response.status === 403 || response.status === 422) && !originalRequest) {

//       try {

//         const newAccessToken = await refreshAccessToken();

//         // Update the token in the original request and retry it
//         originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;
//         return fetch(originalRequest);
//       } catch (refreshError) {
//         // Handle failed refresh here (e.g., redirect to login)
//         return Promise.reject(refreshError);
//       }
//     }
//     return response;
//   },


//   responseError: async function (error) {
//     // Handle an fetch error
//     return Promise.reject(error);
//   }
// });


// axios.interceptors.response.use((response) => {
//   return response;
// }, async (error) => {
//   if (localStorage.getItem('token') === null) {
//     return Promise.reject(error);
//   }
//   const originalRequest = error.config;
// });

// We want the token code running FIRST

const fetchToken = async () => {
  if (process.env.REACT_APP_SERVER_MODE === 'development') {
    console.log("Dev env, fetching dev token");
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/dev_ping`);
      const data = await response.json();
      console.log("Dev token: ", data);
      const token = data.access_token;
      const refreshToken = data.refresh_token;
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
    } catch (error) {
      console.error('Error fetching token:', error);
    }
  }
};
function setupAuth() {

  const interceptors = CreateInterceptors.getInstance();
  interceptors.registerInterceptors();

  const existingToken = localStorage.getItem('token');
  console.log("Existing token: ", existingToken);
  if (!existingToken) {
    fetchToken();
  }
}

setupAuth();

const App: React.FC = () => {

  //   useEffect(() => {
  //     const existingToken = localStorage.getItem('token');
  //     console.log("Existing token: ", existingToken);
  //     if (!existingToken) {
  //       fetchToken();
  //     }
  //   }, []);

  //   useEffect(() => {
  //     console.log("interception")
  //   });


  const devMode = () => {
    return process.env.REACT_APP_SERVER_MODE === 'development';
  }

  // const fetchToken = async () => {
  //   if (process.env.REACT_APP_SERVER_MODE === 'development') {
  //     console.log("Dev env, fetching dev token");
  //     try {
  //       const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/dev_ping`);
  //       const data = await response.json();
  //       console.log("Dev token: ", data);
  //       const token = data.access_token;
  //       const refreshToken = data.refresh_token;
  //       localStorage.setItem('token', token);
  //       localStorage.setItem('refreshToken', refreshToken);
  //     } catch (error) {
  //       console.error('Error fetching token:', error);
  //     }
  //   }
  // };

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
            <Route path="/debug/:model/:storyId" element={<QueryDetails />} />
            {/* <Route path="/about" element={<About/>} /> */}
          </Routes>
        </main>
        <footer className="box footer">
          {devMode() ? <span className="home-notice">This installation is currently in single user ("dev") mode.</span> : null}
          <span>A project by <a href="https://jmerz.is">Julia Merz</a>.</span>
        </footer>
      </div>
    </Router>
  );
};

export default App;
