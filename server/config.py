from pydantic import BaseSettings
from typing import Literal
from functools import lru_cache
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = os.getenv('PROJECT_NAME', 'GPT-4 Story Generator')
    SECRET_KEY: str | None = os.getenv('SECRET_KEY')
    OPENAI_API_KEY: str  | None= os.getenv('OPENAI_API_KEY')
    ENVIRONMENT: str = os.getenv('ENVIRONMENT', 'development')
    DATABASE_URL: str = os.getenv('DATABASE_URL', 'sqlite:///./test.db')
    DATABASE_USERNAME: str = os.getenv('DATABASE_USERNAME', '')
    DATABASE_PASSWORD: str = os.getenv('DATABASE_PASSWORD', '')

@lru_cache()
def get_settings():
    return Settings()
