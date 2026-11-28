# web

from sqlmodel import SQLModel, Field, Relationship
from .base import BaseSQLModel
from pydantic import BaseModel
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime, timedelta

if TYPE_CHECKING:
    from .gen import Story, StoryOutline, ChapterOutline, SceneOutline, Scene
    from .openai import Query

DEFAULT_TOKENS = 100.0

class User(BaseSQLModel, table=True):
    """
    If we want to publicly host this, we need a user model.

    V0 will be single user, so all author keys must be None.
    """
    __tablename__ = 'users' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True}, max_length=50)
    email: str = Field(sa_column_kwargs={"unique": True}, max_length=120)
    verified: bool = Field(default=False)
    social_link: Optional[str] = Field(default=None, max_length=120)
    patreon_link: Optional[str] = Field(default=None, max_length=120)

    hashed_password: str = Field(sa_column_kwargs={"nullable": False})
    superuser: bool = Field(default=False)

    tokens: float = Field(default=DEFAULT_TOKENS)

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationship
    stories: List["Story"] = Relationship(back_populates="author")
    story_outlines: List["StoryOutline"] = Relationship(back_populates="author")
    chapter_outlines: List["ChapterOutline"] = Relationship(
        back_populates="author")
    scene_outlines: List["SceneOutline"] = Relationship(back_populates="author")
    scenes: List["Scene"] = Relationship(back_populates="author")

    queries: List["Query"] = Relationship(back_populates="author")

    verification_codes: List["VerificationCode"] = Relationship(back_populates="user")

    def __repr__(self):
        return f'<User {self.name}>'

class KeyValue(BaseSQLModel, table=True):
    __tablename__ = 'key_values' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(sa_column_kwargs={"unique": True}, max_length=50)
    value_str: Optional[str] = Field(sa_column_kwargs={"unique": True}, default=None, max_length=120)
    value_int: Optional[int] = Field(sa_column_kwargs={"unique": True}, default=None)
    value_bool: Optional[bool] = Field(sa_column_kwargs={"unique": True}, default=None)
    description: str = Field(default="", max_length=120)

class VerificationCode(BaseSQLModel, table=True):
    __tablename__ = 'verification_codes' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(max_length=100)
    user_id: int = Field(foreign_key="users.id")
    expires_at: datetime = Field(default_factory=lambda: datetime.now() + timedelta(hours=48))

    user: "User" = Relationship(back_populates="verification_codes")

    def is_expired(self) -> bool:
        return datetime.now() > self.expires_at

class VerificationCodeCreate(BaseModel):
    user_id: int
    code: str


User.update_forward_refs()

