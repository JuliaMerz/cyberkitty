
from sqlmodel import SQLModel, Field, Relationship
from .base import BaseSQLModel
from typing import Optional, List, Union
from datetime import datetime

from .web import User
from .gen import Story

class CatalogueEntry(BaseSQLModel, table=True):
    __tablename__ = 'catalogue_entries' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    story_id: int = Field(foreign_key="stories.id")
    author_id: int = Field(foreign_key="users.id")

    stars: int = Field(default=0)
    views: int = Field(default=0)
    ratings: int = Field(default=0)

    @property
    def rating(self) -> Union[float, None]:
        if self.ratings == 0:
            return None
        return self.stars / self.ratings


    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    story: Story = Relationship(back_populates="catalogue_entry")
    author: User = Relationship(back_populates="catalogue_entries")

    tags: List["Tag"] = Relationship(back_populates="catalogue_entries", link_model="TagEntryLink")


class Tag(BaseSQLModel, table=True):
    __tablename__ = 'tags' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(sa_column_kwargs={"unique": True}, max_length=50)
    description: str = Field(sa_column_kwargs={"nullable": False}, max_length=120)

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    catalogue_entries: List[CatalogueEntry] = Relationship(back_populates="tags", link_model="TagEntryLink")


class TagEntryLink(BaseSQLModel, table=True):
    __tablename__ = 'tag_entry_links' # type: ignore
    entry_id: int = Field(foreign_key="catalogue_entries.id", primary_key=True)
    tag_id: int = Field(foreign_key="tags.id", primary_key=True)
    _

