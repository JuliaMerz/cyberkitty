# This is literally https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi_jwt_auth import AuthJWT
from fastapi.routing import APIRouter
from sqlmodel import Session
from .models import User
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from .config import get_settings
from .database import get_db_session

conf = get_settings()

# to get a string like this run:
# openssl rand -hex 32
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


class AccessToken(BaseModel):
    access_token: str

class TokenPair(AccessToken):
    refresh_token: str


class TokenData(BaseModel):
    email: str | None = None


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()

class JWTSettings(BaseModel):
    authjwt_secret_key: str | None = None

@AuthJWT.load_config # type: ignore
def get_config():
    return JWTSettings(
        authjwt_secret_key=conf.SECRET_KEY
    )



def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_user(db: Session, email: str) -> User | None:
    print(db.query(User).all())
    return db.query(User).filter(User.email == email).first()


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, conf.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


optional_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="auth", auto_error=False)


async def get_current_user_or_none(db: Session = Depends(get_db_session),  Authorize: AuthJWT = Depends()):
    Authorize.jwt_optional()
    current_user = Authorize.get_jwt_subject() or None


    if current_user is None:
        return None
    else:
        return get_current_user( db, Authorize)


async def get_current_user( db: Session = Depends(get_db_session), Authorize: AuthJWT = Depends()) -> User:
    Authorize.jwt_required()

    current_user_email = Authorize.get_jwt_subject()

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # try:
    #     payload = jwt.decode(token, conf.SECRET_KEY, algorithms=[ALGORITHM])
    #     email: str|None = payload.get("subject")
    #     print("TOKEN TEST", email)
    #     if email is None:
    #         raise credentials_exception
    #     token_data = TokenData(email=email)
    # except JWTError:
    #     raise credentials_exception
    # Safe to ignore type here since we validate that email is not none earlier
    user = get_user(db, email=current_user_email)  # type: ignore
    print(user, current_user_email)
    if user is None:
        raise credentials_exception
    return user


@router.post("/token", response_model=TokenPair)
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Session = Depends(get_db_session), Authorize: AuthJWT = Depends()):
    # Username must be an email
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    # Use create_access_token() and create_refresh_token() to create our
    # access and refresh tokens
    access_token = Authorize.create_access_token(subject=user.email)
    refresh_token = Authorize.create_refresh_token(subject=user.email)
    return {"access_token": access_token, "refresh_token": refresh_token}



@router.post('/refresh')
def refresh(Authorize: AuthJWT = Depends()):
    """
    The jwt_refresh_token_required() function insures a valid refresh
    token is present in the request before running any code below that function.
    we can use the get_jwt_subject() function to get the subject of the refresh
    token, and use the create_access_token() function again to make a new access token
    """
    Authorize.jwt_refresh_token_required()

    current_user = Authorize.get_jwt_subject()
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    new_access_token = Authorize.create_access_token(subject=current_user)
    return {"access_token": new_access_token}

@router.get("/users/me/", response_model=User)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_user)]
):
    return current_user

@router.get("/dev_ping", response_model=TokenPair)
async def dev_login(db: Session = Depends(get_db_session), Authorize: AuthJWT = Depends()):
    if conf.ENVIRONMENT == "development":
        user: User|None = db.query(User).filter(User.superuser==True).first()
        if user is None:
            user = User(name="Dev User", email="admin@admin", hashed_password="", superuser=True)
            db.add(user)
            db.commit()

        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        access_token = Authorize.create_access_token(subject=user.email)
        refresh_token = Authorize.create_refresh_token(subject=user.email)
        return {"access_token": access_token, "refresh_token": refresh_token}

    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not a Development Environment",
            headers={"WWW-Authenticate": "Bearer"},
        )




