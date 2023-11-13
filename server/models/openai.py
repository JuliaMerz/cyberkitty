from __future__ import annotations

from sqlmodel import SQLModel, Field, Relationship
from .base import BaseSQLModel
from typing import Optional, List, Literal, Any, TYPE_CHECKING
from datetime import datetime
import json
from pydantic import BaseModel, validator

if TYPE_CHECKING:
    from .web import User


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class QueryBase(BaseSQLModel):
    author_id: int = Field(foreign_key="users.id")

    continues: int = Field(default=0)
    retries: int = Field(default=0)

    original_prompt: str = Field(sa_column_kwargs={"nullable": False})
    complete_output: str = Field(sa_column_kwargs={"nullable": False})

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)


class Query(QueryBase, table=True):
    __tablename__ = 'queries' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    _previous_messages: str = Field(
        default='[]', alias="previous_messages")  # json as str
    _all_messages: str = Field(
        default='[]', alias="all_messages")  # json as str

    @property
    def total_cost(self) -> float:
        return sum([call.cost for call in self.api_calls if call.cost is not None])

    @property
    def previous_messages(self) -> List[Message]:
        return json.loads(self._previous_messages, object_hook=lambda d: Message(**d))

    @previous_messages.setter
    def previous_messages(self, value: List[Message]):
        self._previous_messages = json.dumps([v.dict() for v in value])

    @property
    def all_messages(self) -> List[Message]:
        return json.loads(self._all_messages, object_hook=lambda d: Message(**d))

    @all_messages.setter
    def all_messages(self, value: List[Message]):
        self._all_messages = json.dumps([v.dict() for v in value])


    # Relationships
    author: "User" = Relationship(back_populates="queries")
    api_calls: List[ApiCall] = Relationship(back_populates="query")

class QueryRead(QueryBase):
    id: int = Field(primary_key=True)

    # add autogens
    total_cost: float = Field()

    previous_messages: List[Message] = Field()
    all_messages: List[Message] = Field()

    api_calls: List["ApiCallRead"] = Field()


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

    _input_messages: str = Field(
        default='[]', alias="input_messages")  # json as str

    @property
    def input_messages(self) -> List[Message]:
        return json.loads(self._input_messages, object_hook=lambda d: Message(**d))

    @input_messages.setter
    def input_messages(self, value: List[Message]):
        self._input_messages = json.dumps([v.dict() for v in value])

    # Relationship
    query: Query = Relationship(back_populates="api_calls")

class ApiCallRead(ApiCallBase):
    id: int = Field(primary_key=True)

    #add gens
    input_messages: List[Message] = Field()
