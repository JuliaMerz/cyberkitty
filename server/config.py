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
    OPENAI_BASE_URL: str  | None= config.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    ENVIRONMENT: str = config.get('ENVIRONMENT', 'development')
    DB_HOST: str = config.get('DB_HOST', './test.db')
    DB_DRIVER: str = config.get('DB_DRIVER', 'sqlite')
    DB_USER: str = config.get('DB_USER', '')
    DB_PASS: str = config.get('DB_PASS', '')
    DB_NAME: str = config.get('DB_NAME', '')
    DOMAIN_ROOT: str = config.get('DOMAIN_ROOT', 'http://localhost:8000')
    # TWILIO_ACCOUNT_SID: str = config.get('TWILIO_ACCOUNT_SID', '')
    # TWILIO_AUTH_TOKEN: str = config.get('TWILIO_AUTH_TOKEN', '')
    # TWILIO_VERIFY_SERVICE: str = config.get('TWILIO_VERIFY_SERVICE', '')
    SENDGRID_API_KEY: str = config.get('SENDGRID_API_KEY', '')
    VERIFICATION_EMAIL_TEMPLATE_ID: str = config.get('VERIFICATION_EMAIL_TEMPLATE_ID', '')
    EMAIL_FROM: str = config.get('EMAIL_FROM', '')
    DATABASE_URL: str = config.get('DB_DRIVER', 'sqlite')+ ":///"+config.get('DB_HOST', './test.db')
    SYS_PROMPT_PREFIX: str = config.get('SYS_PROMPT_PREFIX')
    MAX_RETRIES: int = config.get('MAX_RETRIES', 3)
    QUERY_MAX_TOKENS: float = config.get('QUERY_MAX_TOKENS', None)
    QUERY_TEMPERATURE: float = config.get('QUERY_TEMPERATURE', 0)
    QUERY_FREQUENCY_PENALTY: float = config.get('QUERY_FREQUENCY_PENALTY', 0.1)


@lru_cache()
def get_settings():
    return Settings()
