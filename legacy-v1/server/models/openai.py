
from sqlmodel import SQLModel, Field, Relationship
from .base import BaseSQLModel
from .gen import Story, StoryOutline, ChapterOutline, SceneOutline, Scene
from typing import Optional, List, Literal, Any, TYPE_CHECKING, Union
from datetime import datetime
import json
from pydantic import BaseModel, validator


if TYPE_CHECKING:
    from .web import User
    from .gen import Story, StoryOutline, ChapterOutline, SceneOutline, Scene, StoryRead, StoryOutlineRead, ChapterOutlineRead, SceneOutlineRead, SceneRead


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str



class QueryBase(BaseSQLModel):
    author_id: int = Field(foreign_key="users.id")

    # Only one of these should ever be not-none. We might enforce via constraint later.
    story_id: Optional[int] = Field(foreign_key="stories.id", default=None)
    story_outline_id: Optional[int] = Field(foreign_key="story_outlines.id", default=None)
    chapter_outline_id: Optional[int] = Field(foreign_key="chapter_outlines.id", default=None)
    scene_outline_id: Optional[int] = Field(foreign_key="scene_outlines.id", default=None)
    scene_id: Optional[int] = Field(foreign_key="scenes.id", default=None)

    continues: int = Field(default=0)
    retries: int = Field(default=0)

    original_prompt: str = Field(sa_column_kwargs={"nullable": False})
    system_prompt: str = Field(sa_column_kwargs={"nullable": False})
    complete_output: str = Field(sa_column_kwargs={"nullable": False})

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)


class Query(QueryBase, table=True):
    __tablename__ = 'queries' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    internal_previous_messages: str = Field(
        default='[]', alias="previous_messages")  # json as str
    internal_all_messages: str = Field(
        default='[]', alias="all_messages")  # json as str


    @property
    def total_cost(self) -> float:
        return sum([call.cost for call in self.api_calls if call.cost is not None])

    @property
    def previous_messages(self) -> List[Message]:
        return json.loads(self.internal_previous_messages, object_hook=lambda d: Message(**d))

    @previous_messages.setter
    def previous_messages(self, value: List[Message]) -> None:
        self.internal_previous_messages = json.dumps([v.dict() for v in value])

    @property
    def all_messages(self) -> List[Message]:
        return json.loads(self.internal_all_messages, object_hook=lambda d: Message(**d))

    @all_messages.setter
    def all_messages(self, value: List[Message]):
        self.internal_all_messages = json.dumps([v.dict() for v in value])

    @property
    def linked_obj(self) -> Optional[Union["Story" , "StoryOutline" , "ChapterOutline" , "SceneOutline" , "Scene"]]:
        if self.story_outline is not None:
            return self.story_outline
        elif self.chapter_outline is not None:
            return self.chapter_outline
        elif self.scene_outline is not None:
            return self.scene_outline
        elif self.scene is not None:
            return self.scene
        # Twisted logic: Queries are ALWAYS attached to a story if they are attached to anything.
        # But they might be ONLY attached to a story. We do it like this because SQLAlchemy
        # doesn't support multiple foreign keys to the same table very well.
        elif self.story is not None:
            return self.story
        else:
            return None

    @property
    def root_story(self) -> Optional["Story"]:
        if self.story is not None:
            return self.story


    # Relationships
    author: "User" = Relationship(back_populates="queries")
    api_calls: List["ApiCall"] = Relationship(back_populates="query")

    story: Optional["Story"] = Relationship(back_populates="queries")
    story_outline: Optional["StoryOutline"] = Relationship(back_populates="queries")
    chapter_outline: Optional["ChapterOutline"] = Relationship(back_populates="queries")
    scene_outline: Optional["SceneOutline"] = Relationship(back_populates="queries")
    scene: Optional["Scene"] = Relationship(back_populates="queries")

    # Removed because sqlalchemy
    # root_story: Optional["Story"] = Relationship(back_populates="child_queries")


LinkableObject = Story | StoryOutline | ChapterOutline | SceneOutline | Scene

class QueryRead(QueryBase):
    id: int = Field(primary_key=True)

    # add autogens
    total_cost: float = Field()

    previous_messages: List[Message] = Field()
    all_messages: List[Message] = Field()

    api_calls: List["ApiCallRead"] = Field()

    linked_obj: Optional[LinkableObject] = Field()


class ApiCallBase(BaseSQLModel):
    query_id: int = Field(foreign_key="queries.id")

    timestamp: datetime = Field(default_factory=datetime.now)
    success: bool = Field(default=False)
    error: Optional[str] = Field(default=None)
    cost: Optional[float] = Field(default=None)
    output: str = Field(sa_column_kwargs={"nullable": False})

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)


class ApiCall(ApiCallBase, table=True):
    __tablename__ = 'api_calls' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)

    internal_input_messages: str = Field(
        default='[]', alias="input_messages")  # json as str

    @property
    def input_messages(self) -> List[Message]:
        return json.loads(self.internal_input_messages, object_hook=lambda d: Message(**d))

    @input_messages.setter
    def input_messages(self, value: List[Message]):
        self.internal_input_messages = json.dumps([v.dict() for v in value])

    # Relationship
    query: Query = Relationship(back_populates="api_calls")


class ApiCallRead(ApiCallBase):
    id: int = Field(primary_key=True)

    #add gens
    input_messages: List[Message] = Field()


