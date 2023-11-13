# web

from sqlmodel import SQLModel, Field, Relationship
from .base import BaseSQLModel
from .openai import Query
from typing import Optional, List, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .gen import Story, StoryOutline, ChapterOutline, SceneOutline, Scene


class User(BaseSQLModel, table=True):
    """
    If we want to publicly host this, we need a user model.

    V0 will be single user, so all author keys must be None.
    """
    __tablename__ = 'users' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True}, max_length=50)
    email: str = Field(sa_column_kwargs={"unique": True}, max_length=120)

    tokens: float = Field(default=0.0)

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationship
    stories: List["Story"] = Relationship(back_populates="author")
    story_outlines: List["StoryOutline"] = Relationship(back_populates="author")
    chapter_outlines: List["ChapterOutline"] = Relationship(
        back_populates="author")
    scene_outlines: List["SceneOutline"] = Relationship(back_populates="author")
    scenes: List["Scene"] = Relationship(back_populates="author")

    queries: List[Query] = Relationship(back_populates="author")

    def __repr__(self):
        return f'<User {self.name}>'
