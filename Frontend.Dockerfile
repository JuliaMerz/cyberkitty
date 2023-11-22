### STAGE 1: Build ###
FROM node:16.10-alpine AS build

# Define work directory in our container
WORKDIR /frontend

# Copy files to the container work directory
COPY frontend/package.json frontend/yarn.lock ./

# Install all the packages
RUN yarn install
ARG REACT_APP_API_URL
ARG NODE_ENV
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SERVER_MODE=$NODE_ENV


# Copy frontend directory from our machine to container work directory
COPY frontend .

RUN yarn install

# Build frontend to be ready for production deployment
RUN yarn build --NODE_ENV=$NODE_ENV

### STAGE 2: Run ###
FROM nginx:1.17.1-alpine

# Use nginx configuration file and put it as a config file for container nginx
COPY ./nginx.conf /etc/nginx/nginx.conf

# Copy dist file which contains production-ready application
# and put it in container's html directory to be served by nginx
COPY --from=build /frontend/build /usr/share/nginx/html

#COPY --from=build /frontend /copiedfrontendh
