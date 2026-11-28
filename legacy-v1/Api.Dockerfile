# The base image that we are going to use
FROM python:3.10

# Define default work directory
WORKDIR /code

# First, we copy requirements.txt into our container's /code directory
COPY requirements.txt /code/requirements.txt
COPY alembic.ini /code/alembic.ini
COPY migrations /code/migrations

# Install all the requirements
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy all of the api server source code
COPY ./server /code/server
COPY ./startup.sh /code/startup.sh
RUN chmod +x /code/startup.sh


# CMD ["ls", "-la", "."]
# CMD ls -la .; pwd
# CMD ["pwd"]

# Run the migrations

# Spin up the application by running this command
# CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

CMD ["./startup.sh"]

