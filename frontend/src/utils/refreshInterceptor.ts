import fetchIntercept from 'fetch-intercept';

const REFRESH_URL = `${process.env.REACT_APP_API_URL}/auth/refresh`;


export const fetchToken = async () => {
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

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      Authorization: "Bearer " + refreshToken
    }
  });
  const data = await response.json();
  localStorage.setItem('token', data.access_token);
  return data.access_token;
};

interface IDataRequest {
  [key: string]: Request;
}

export const CreateInterceptors = (() => {
  let instance: any;

  const init = () => {
    let isRefreshing = false;
    let refreshSubscribers: any = [];
    let dataRequests = {} as IDataRequest;

    const logoutUser = () => {
      console.log("logout method here");
    };

    const subscribeTokenRefresh = (callback: any) => {
      refreshSubscribers.push(callback);
    };

    const onRefreshed = (new_token: any) => {
      refreshSubscribers.map((callback: any) => {
        callback(new_token)
      });
      refreshSubscribers = [];
    };

    const removeDataRequestsItem = (requestKey: any) => {
      const {[requestKey]: _omit, ...remaining} = dataRequests;
      dataRequests = remaining;
    };

    const getRelativeUrl = (url: any) => url.replace(window.location.origin, '');

    return {
      registerInterceptors: () => {
        fetchIntercept.register({
          request(url, config) {
            if (config && url.indexOf(REFRESH_URL) === -1) {
              const key = `${getRelativeUrl(url)}_${config.method || 'GET'}`;

              dataRequests = {
                ...dataRequests,
                [key]: config,
              };
            }
            // Attach auth token
            if (config === undefined) {
              config = {};
            }
            if (config.headers === undefined) {
              config.headers = {};
            }

            if (config.headers.Authorization) {
              return [url, config];
            }
            const token = localStorage.getItem('token');
            if (token) {
              config.headers.Authorization = `Bearer ${token}`;
            }
            return [url, config];
          },

          response(response) {
            const requestKey = `${getRelativeUrl(response.url)}_${response.request.method}`;
            // We need to allow 422 here for fastapi-auth-jwt
            if ((response.status === 401 || response.status === 422) && response.url.indexOf(REFRESH_URL) === -1) {
              const js: any = response.clone().json().then((data: any) => {
                if (data['detail'] === 'Signature has expired' || data['detail'] === 'Token is invalid') {
                  console.log('refreshing');

                  if (!isRefreshing) {
                    isRefreshing = true;
                    refreshAccessToken()
                      .then((new_token: any) => {
                        isRefreshing = false;
                        onRefreshed(new_token);
                      }) // Note that this logs out on refresh + bad request (unrelated to auth)
                      .catch((e) => {
                        console.log(e);
                        logoutUser();
                      });
                  }
                  const retryOrigReq: any = new Promise((resolve, reject) => {
                    subscribeTokenRefresh((new_token: any) => {
                      fetch(response.url, {
                        ...dataRequests[requestKey],
                        headers: {
                          ...dataRequests[requestKey].headers,
                          Authorization: `Bearer ${new_token}`,
                        },
                      })
                        .then(origReqResponse => {
                          resolve(origReqResponse);
                          removeDataRequestsItem(requestKey);
                        })
                        .catch(err => {
                          reject(err);
                        });
                    });
                  });
                  return retryOrigReq;
                }
                removeDataRequestsItem(requestKey);
                return response;
              });
              return js;
            }
            removeDataRequestsItem(requestKey);
            return response;
          },
        });
      },
    };
  };

  return {
    getInstance() {
      if (!instance) {
        instance = init();
      }
      return instance;
    },
  };
})();
