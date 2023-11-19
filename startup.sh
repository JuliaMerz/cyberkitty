#!/bin/sh

alembic upgrade head

uvicorn server.main:app --host 0.0.0.0 --port 8000 --proxy-headers


