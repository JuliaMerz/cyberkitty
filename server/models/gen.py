
from sqlmodel import SQLModel, Field, Relationship
from .. import formats
import json
from .web import User
from .base import BaseSQLModel
from typing import Optional, List, Union
from datetime import datetime


class StoryBase(BaseSQLModel):
    title: str = Field(max_length=50)
    # Adjusted to use foreign_key
    author_id: int = Field(foreign_key="users.id")

    description: str = Field()
    style: str = Field()
    themes: str = Field()
    request: str = Field()

    # GPT Generated
    setting: Optional[str] = Field(default=None)
    main_characters: Optional[str] = Field(default=None)
    summary: Optional[str] = Field(default=None)

class Story(StoryBase, table=True):
    __tablename__ = 'stories' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    _tags: str = Field(
        default='[]', alias="tags")  # json as str

    @property
    def tags(self) -> List[str]:
        return json.loads(self._tags)

    @tags.setter
    def tags(self, value: List[str]):
        self._tags = json.dumps(value)


    # Standard Database Package
    modified: bool = Field(default=False)
    is_public: bool = Field(default=False)

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: User = Relationship(back_populates="stories")
    # only a single story outline should ever be valid, but if we regen we might get multiple.
    story_outlines: List["StoryOutline"] = Relationship(back_populates="story")

    @property
    def current_story_outline(self) -> Optional["StoryOutlineRead"]:
        out =  [StoryOutlineRead.from_orm(x) for x in filter(lambda x: not x.invalidated, self.story_outlines)]
        return out[0] if len(out)>0 else None

    @property
    def all_story_outlines(self) -> List["StoryOutlineRead"]:
        return [StoryOutlineRead.from_orm(x) for x in self.story_outlines]


    def __repr__(self):
        return f'<Story {self.title} — by Author ID {self.author_id}>'

class StoryRead(StoryBase):
    id: int = Field()
    modified: bool = Field()
    is_public: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    tags: List[str] = Field()

    # Relationships
    author: User = Field()
    all_story_outlines: List["StoryOutlineRead"] = Field()
    current_story_outline: Optional["StoryOutlineRead"] = Field()

class StoryReadRecursive(StoryBase):
    current_story_outline: Union["StoryOutlineReadRecursive",None] = Field()





class StoryOutlineBase(BaseSQLModel):
    author_id: int = Field(foreign_key="users.id")
    story_id: int = Field(foreign_key="stories.id")

    # GPT Generated
    outline_onesentence: Optional[str] = Field(default=None)
    outline_mainevents_raw: Optional[str] = Field(default=None)
    editing_notes: Optional[str] = Field(default=None)
    outline_mainevents_improved: Optional[str] = Field(default=None)
    outline_paragraphs: Optional[str] = Field(default=None)
    fact_sheets: Optional[str] = Field(default=None)
    characters: Optional[str] = Field(default=None)


class StoryOutline(StoryOutlineBase, table=True):
    __tablename__ = 'story_outlines' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)

    # this should return a list of scene outlines. unsaved.
    @property
    def outline_onesentence_parsed(self) -> list[formats.SimpleOutlineInnerParsed]:
        return formats.parse_story_outline_simple(self.outline_onesentence)['chapters']

    # this should return a list of scene outlines. unsaved.
    @property
    def outline_mainevents_raw_parsed(self) -> list[formats.MediumOutlineInnerParsed]:
        return formats.parse_story_outline_medium(self.outline_mainevents_raw)['chapters']

    @property
    def outline_mainevents_improved_parsed(self) -> list[formats.MediumOutlineInnerParsed]:
        return formats.parse_story_outline_medium(self.outline_mainevents_improved)['chapters']

    @property
    def outline_paragraphs_parsed(self) -> list[formats.ComplexOutlineInnerParsed]:
        return formats.parse_story_outline_complex(self.outline_paragraphs)['chapters']

    # Standard Database Package
    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)

    @property
    def is_public(self) -> bool:
        return self.story.is_public

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: User = Relationship(back_populates="story_outlines")
    story: Story = Relationship(back_populates="story_outlines")
    chapter_outlines: List["ChapterOutline"] = Relationship(
        back_populates="story_outline")

    @property
    def current_chapter_outlines(self):
        return [x for x in filter(lambda x: not x.invalidated, self.chapter_outlines)]

    @property
    def all_chapter_outlines(self):
        return self.chapter_outlines


class StoryOutlineRead(StoryOutlineBase):
    id: int = Field()
    modified: bool = Field()
    is_public: bool = Field()
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    outline_onesentence_parsed: list[formats.SimpleOutlineInnerParsed] = Field()
    outline_mainevents_raw_parsed: list[formats.MediumOutlineInnerParsed] = Field()
    outline_mainevents_improved_parsed: list[formats.MediumOutlineInnerParsed] = Field()
    outline_paragraphs_parsed: list[formats.ComplexOutlineInnerParsed] = Field()

    # Relationships
    author: User = Field()
    story: Story = Field()
    all_chapter_outlines: List["ChapterOutlineRead"] = Field()
    current_chapter_outlines: List["ChapterOutlineRead"] = Field()

class StoryOutlineReadRecursive(StoryOutlineBase):
    current_chapter_outlines: List["ChapterOutlineReadRecursive"] = Field()

"""
Chapter Outline
"""

class ChapterOutlineBase(BaseSQLModel):
    author_id: int = Field(foreign_key="users.id")
    story_outline_id: int = Field(
        foreign_key="story_outlines.id")

    previous_chapter_id: Optional[int] = Field(
        default=None, unique=True, foreign_key="chapter_outlines.id")

    chapter_number: int = Field()
    title: str = Field(max_length=150)
    purpose: str = Field()
    main_events: str = Field()
    paragraph_summary: str = Field()
    chapter_notes: str = Field()

    # GPT Generated
    raw: Optional[str] = Field(default=None)
    edit_notes: Optional[str] = Field(default=None)
    improved: Optional[str] = Field(default=None)

class ChapterOutline(ChapterOutlineBase, table=True):
    __tablename__ = 'chapter_outlines' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)

    @property
    # this should return a list of scene outlines. unsaved.
    def raw_parsed(self) -> list[formats.ChapterOutlineInnerParsed]:
        return formats.parse_chapter_outline(self.raw)['scenes']

    @property
    # this should return a list of scene outlines. unsaved.
    def improved_parsed(self) -> list[formats.ChapterOutlineInnerParsed]:
        return formats.parse_chapter_outline(self.improved)['scenes']

    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)

    @property
    def is_public(self) -> bool:
        return self.story_outline.story.is_public

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    story_outline: StoryOutline = Relationship(
        back_populates="chapter_outlines")
    author: "User" = Relationship(back_populates="chapter_outlines")
    scene_outlines: List["SceneOutline"] = Relationship(
        back_populates="chapter_outline")

    @property
    def current_scene_outlines(self):
        return [x for x in filter(lambda x: not x.invalidated, self.scene_outlines)]

    @property
    def all_scene_outlines(self):
        return self.scene_outlines

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_chapter(self) -> Optional["ChapterOutline"]:
        out = [x for x in filter(lambda x: not x.invalidated, self.next_chapters)]
        return out[0] if len(out)>0 else None

    previous_chapter: Optional["ChapterOutline"] = Relationship(
        back_populates="next_chapters")
    next_chapters: List["ChapterOutline"] = Relationship(
        sa_relationship_kwargs={"remote_side": "ChapterOutline.id", "foreign_keys": "[ChapterOutline.previous_chapter_id]", "uselist": False},
        back_populates="previous_chapter")

class ChapterOutlineRead(ChapterOutlineBase):
    id: int = Field()
    modified: bool = Field()
    is_public: bool = Field()
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: list[formats.ChapterOutlineInnerParsed] = Field()
    improved_parsed: list[formats.ChapterOutlineInnerParsed] = Field()

    # Relationships
    story_outline: StoryOutline = Field()
    author: User = Field()
    all_scene_outlines: List["SceneOutlineRead"] = Field()
    current_scene_outlines: List["SceneOutlineRead"] = Field()

    previous_chapter: Optional["ChapterOutlineRead"] = Field()
    next_chapter: Optional["ChapterOutlineRead"] = Field()

class ChapterOutlineReadRecursive(ChapterOutlineRead):
    current_scene_outlines: List["SceneOutlineReadRecursive"] = Field()


"""
SceneOutline
"""
class SceneOutlineBase(BaseSQLModel):
    author_id: int = Field(foreign_key="users.id")
    chapter_outline_id: int = Field(
        foreign_key="chapter_outlines.id")
    previous_scene_id: Optional[int] = Field(
        default=None, foreign_key="scene_outlines.id")

    scene_number: int = Field()
    setting: str = Field()
    primary_function: str = Field()
    secondary_function: str = Field()
    summary: str = Field()
    context: str = Field()

    # GPT Generated
    raw: Optional[str] = Field(default=None)
    edit_notes: Optional[str] = Field(default=None)
    improved: Optional[str] = Field(default=None)

class SceneOutline(SceneOutlineBase, table=True):
    __tablename__ = 'scene_outlines' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)

    @property
    def raw_parsed(self) -> list[formats.SceneOutlineInnerParsed]:
        return formats.parse_scene_outline(self.raw)['scenes']

    @property
    def improved_parsed(self) -> list[formats.SceneOutlineInnerParsed]:
        return formats.parse_scene_outline(self.improved)['scenes']

    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)

    @property
    def is_public(self) -> bool:
        return self.chapter_outline.story_outline.story.is_public

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: User = Relationship(back_populates="scene_outlines")
    chapter_outline: ChapterOutline = Relationship(
        back_populates="scene_outlines")
    scenes: List["Scene"] = Relationship(back_populates="scene_outline")

    @property
    def current_scene(self):
        out =  [x for x in filter(lambda x: not x.invalidated, self.scenes)]
        return out[0] if len(out)>0 else None

    @property
    def all_scenes(self):
        return self.scenes

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_scene_outline(self) -> Optional["SceneOutline"]:
        out = [x for x in filter(lambda x: not x.invalidated, self.next_scene_outlines)]
        return out[0] if len(out)>0 else None

    previous_scene_outline: Optional["SceneOutline"] = Relationship(
        back_populates="next_scene_outlines")
    next_scene_outlines: List["SceneOutline"] = Relationship(
        sa_relationship_kwargs={"remote_side": "SceneOutline.id", "foreign_keys": "[SceneOutline.previous_scene_id]", "uselist": False},
        back_populates="previous_scene_outline")


class SceneOutlineRead(SceneOutlineBase):
    id: int = Field()
    modified: bool = Field()
    is_public: bool = Field()
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: list[formats.SceneOutlineInnerParsed] = Field()
    improved_parsed: list[formats.SceneOutlineInnerParsed] = Field()

    # Relationships
    author: User = Field()
    chapter_outline: ChapterOutline = Field()
    all_scenes: List["SceneRead"] = Field()
    current_scene: Union["SceneRead",None] = Field()

    previous_scene_outline: Optional["SceneOutlineRead"] = Field()
    next_scene_outline: Optional["SceneOutlineRead"] = Field()

class SceneOutlineReadRecursive(SceneOutlineRead):
    pass



class SceneBase(BaseSQLModel):
    author_id: int = Field(default=None, foreign_key="users.id")
    scene_outline_id: int = Field(
        foreign_key="scene_outlines.id")
    previous_scene_id: Optional[int] = Field(
        default=None, foreign_key="scenes.id")

    scene_number: int = Field()

    # GPT Generated
    raw: Optional[str] = Field(default=None)
    edit_notes: Optional[str] = Field(default=None)
    improved: Optional[str] = Field(default=None)

class Scene(SceneBase, table=True):
    __tablename__ = 'scenes' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    @property
    def raw_parsed(self):
        return formats.parse_scene_outline(self.raw)

    @property
    def improved_parsed(self):
        return formats.parse_scene_outline(self.improved)

    @property
    def raw_text(self):
        d = formats.parse_scene_text(self.raw_parsed)
        out = []
        for section in d['sections']:
            out.append(section['content'])
        return '\n\n'.join(out)

    @property
    def improved_text(self):
        d = formats.parse_scene_text(self.raw_parsed)
        out = []
        for section in d['sections']:
            out.append(section['content'])
        return '\n\n'.join(out)

    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)

    @property
    def is_public(self) -> bool:
        # TODO: This is very long, consider optimizing.
        return self.scene_outline.chapter_outline.story_outline.story.is_public

    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: "User" = Relationship(back_populates="scenes")
    scene_outline: "SceneOutline" = Relationship(back_populates="scenes")

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_scene(self) -> Optional["Scene"]:
        out = [x for x in filter(lambda x: not x.invalidated, self.next_scenes)]
        return out[0] if len(out)>0 else None

    previous_scene: Optional["Scene"] = Relationship(
        back_populates="next_scenes")
    next_scenes: List["Scene"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Scene.id", "foreign_keys": "[Scene.previous_scene_id]", "uselist": False},
        back_populates="previous_scene")


class SceneRead(SceneBase):
    id: int = Field()
    modified: bool = Field()
    is_public: bool = Field()
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: dict = Field()
    improved_parsed: dict = Field()

    raw_text: str = Field()
    improved_text: str = Field()

    # Relationships
    author: User = Field()
    scene_outline: SceneOutline = Field()

    previous_scene: Optional["SceneRead"] = Field()
    next_scene: Optional["SceneRead"] = Field()


Story.update_forward_refs()
StoryOutline.update_forward_refs()
ChapterOutline.update_forward_refs()
SceneOutline.update_forward_refs()
Scene.update_forward_refs()

StoryRead.update_forward_refs()
StoryReadRecursive.update_forward_refs()
StoryOutlineRead.update_forward_refs()
StoryOutlineReadRecursive.update_forward_refs()
ChapterOutlineRead.update_forward_refs()
ChapterOutlineReadRecursive.update_forward_refs()
SceneOutlineRead.update_forward_refs()
SceneOutlineReadRecursive.update_forward_refs()
SceneRead.update_forward_refs()
