from pydantic import BaseSettings
from typing import Literal
from functools import lru_cache
import os
from dotenv import dotenv_values



config = {
    **dotenv_values(".env.development"),  # load shared development variables
    **dotenv_values(".env.production"),  # load sensitive variables
    **dotenv_values(".env"),  # load sensitive variables
    **os.environ,  # override loaded values with environment variables
}

class Settings(BaseSettings):
    PROJECT_NAME: str = config.get('PROJECT_NAME', 'GPT-4 Story Generator')
    SECRET_KEY: str | None = config.get('SECRET_KEY')
    OPENAI_API_KEY: str  | None= config.get('OPENAI_API_KEY')
    ENVIRONMENT: str = config.get('ENVIRONMENT', 'development')
    DATABASE_URL: str = config.get('DATABASE_URL', 'sqlite:///./test.db')
    DATABASE_USERNAME: str = config.get('DATABASE_USERNAME', '')
    DATABASE_PASSWORD: str = config.get('DATABASE_PASSWORD', '')
    DOMAIN_ROOT: str = config.get('DOMAIN_ROOT', 'http://localhost:8000')
    # TWILIO_ACCOUNT_SID: str = config.get('TWILIO_ACCOUNT_SID', '')
    # TWILIO_AUTH_TOKEN: str = config.get('TWILIO_AUTH_TOKEN', '')
    # TWILIO_VERIFY_SERVICE: str = config.get('TWILIO_VERIFY_SERVICE', '')
    SENDGRID_API_KEY: str = config.get('SENDGRID_API_KEY', '')
    VERIFICATION_EMAIL_TEMPLATE_ID: str = config.get('VERIFICATION_EMAIL_TEMPLATE_ID', '')
    EMAIL_FROM: str = config.get('EMAIL_FROM', '')


@lru_cache()
def get_settings():
    return Settings()
