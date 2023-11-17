
from sqlmodel import SQLModel, Field, Relationship
from .. import formats
import json
from .web import User
from .base import BaseSQLModel
from typing import Optional, List, Union, TYPE_CHECKING
from datetime import datetime

if TYPE_CHECKING:
    from .openai import Query, QueryRead



class StoryBase(BaseSQLModel):
    title: str = Field(max_length=50)

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
    # Adjusted to use foreign_key
    author_id: int = Field(foreign_key="users.id")
    raw_tags: str = Field(default='[]')  # json as str

    @property
    def tags(self) -> List[str]:
        return json.loads(self.raw_tags)

    @tags.setter
    def tags(self, value: List[str]):
        self.raw_tags = json.dumps(value)


    # Standard Database Package
    modified: bool = Field(default=False)
    # special because we don't sit setting/mc/summary in storyoutline
    modified_generated: bool = Field(default=False)
    is_public: bool = Field(default=False)


    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: "User" = Relationship(back_populates="stories")
    # only a single story outline should ever be valid, but if we regen we might get multiple.
    story_outlines: List["StoryOutline"] = Relationship(back_populates="story")

    queries: List["Query"] = Relationship(back_populates="story",
                                          sa_relationship_kwargs= {
                                              "foreign_keys":"Query.story_id"}
                                          )

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
    author_id: int = Field()
    modified: bool = Field()
    modified_generated: bool = Field()
    is_public: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    tags: List[str] = Field()

    # Relationships
    author: "User" = Field()
    # all_story_outlines: List["StoryOutlineRead"] = Field()
    current_story_outline: Optional["StoryOutlineRead"] = Field()

class StoryReadRecursive(StoryRead):
    current_story_outline: Union["StoryOutlineReadRecursive",None] = Field()

class StoryReadQueries(StoryRead):
    queries: List["QueryRead"] = Field()




class StoryOutlineBase(BaseSQLModel):
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
    author_id: int = Field(foreign_key="users.id")

    # this should return a list of scene outlines. unsaved.
    @property
    def outline_onesentence_parsed(self) -> list[formats.SimpleOutlineInnerParsed]:
        if self.outline_onesentence is None:
            return []
        return formats.parse_story_outline_simple(self.outline_onesentence)['chapters']

    # this should return a list of scene outlines. unsaved.
    @property
    def outline_mainevents_raw_parsed(self) -> list[formats.MediumOutlineInnerParsed]:
        if self.outline_mainevents_raw is None:
            return []
        return formats.parse_story_outline_medium(self.outline_mainevents_raw)['chapters']

    @property
    def outline_mainevents_improved_parsed(self) -> list[formats.MediumOutlineInnerParsed]:
        if self.outline_mainevents_improved is None:
            return []
        return formats.parse_story_outline_medium(self.outline_mainevents_improved)['chapters']

    @property
    def outline_paragraphs_parsed(self) -> list[formats.ComplexOutlineInnerParsed]:
        if self.outline_paragraphs is None:
            return []
        return formats.parse_story_outline_complex(self.outline_paragraphs)['chapters']

    # if we allow chapteroutlines to be edited, we need to compute the current outline
    # for generation, instead of using the original generated outline. see orechestration.py
    @property
    def computed_story_outline(self) -> str:
        print('computing story outline')

        outs = self.chapter_outlines
        outs = filter(lambda x: not x.invalidated, outs)
        outs = sorted(outs, key=lambda x: x.chapter_number)
        print('outlining check', [x.chapter_number for x in outs]) # just a debug check
        return "\n\n".join([x.computed_pre_gen for x in outs])


    # Standard Database Package
    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)


    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: "User" = Relationship(back_populates="story_outlines")
    story: Story = Relationship(back_populates="story_outlines")
    chapter_outlines: List["ChapterOutline"] = Relationship(
        back_populates="story_outline")
    queries: List["Query"] = Relationship(back_populates="story_outline")

    @property
    def current_chapter_outlines(self)-> List["ChapterOutlineRead"]:

        f =  [ChapterOutlineRead.from_orm(x) for x in filter(lambda x: not x.invalidated, self.chapter_outlines)]
        return f

    @property
    def all_chapter_outlines(self) -> List["ChapterOutlineRead"]:
        return [ChapterOutlineRead.from_orm(x) for x in self.chapter_outlines]


class StoryOutlineRead(StoryOutlineBase):
    id: int = Field()
    author_id: int = Field()
    modified: bool = Field()
    is_public: bool = False
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    outline_onesentence_parsed: list[formats.SimpleOutlineInnerParsed] = Field()
    outline_mainevents_raw_parsed: list[formats.MediumOutlineInnerParsed] = Field()
    outline_mainevents_improved_parsed: list[formats.MediumOutlineInnerParsed] = Field()
    outline_paragraphs_parsed: list[formats.ComplexOutlineInnerParsed] = Field()

    # Relationships
    author: "User" = Field()
    story: StoryBase = Field()
    # all_chapter_outlines: List["ChapterOutlineRead"] = Field()
    current_chapter_outlines: List["ChapterOutlineRead"] = Field()

class StoryOutlineReadRecursive(StoryOutlineBase):
    current_chapter_outlines: List["ChapterOutlineReadRecursive"] = Field()

class StoryOutlineReadQueries(StoryOutlineRead):
    queries: List["QueryRead"] = Field()

"""
Chapter Outline
"""

class ChapterOutlineBase(BaseSQLModel):
    story_outline_id: int = Field(
        foreign_key="story_outlines.id")

    previous_chapter_id: Optional[int] = Field(
        default=None, unique=True, foreign_key="chapter_outlines.id")

    part_label: Optional[str] = Field()
    chapter_number: int = Field()
    title: str = Field(max_length=150)
    purpose: str = Field()
    main_events: str = Field()
    chapter_summary: str = Field()
    chapter_notes: str = Field()

    # GPT Generated
    raw: Optional[str] = Field(default=None)
    edit_notes: Optional[str] = Field(default=None)
    improved: Optional[str] = Field(default=None)

class ChapterOutline(ChapterOutlineBase, table=True):
    __tablename__ = 'chapter_outlines' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="users.id")

    @property
    # this should return a list of scene outlines. unsaved.
    def raw_parsed(self) -> list[formats.ChapterOutlineInnerParsed]:
        if self.raw is None:
            return []
        return formats.parse_chapter_outline(self.raw)['scenes']

    @property
    # this should return a list of scene outlines. unsaved.
    def improved_parsed(self) -> list[formats.ChapterOutlineInnerParsed]:
        if self.improved is None:
            return []
        return formats.parse_chapter_outline(self.improved)['scenes']

    # This is for regenerating a storyoutline from chapters
    @property
    def computed_pre_gen(self) -> str:
        part_label = (self.part_label+'\n') if self.part_label is not None else ''
        s = f"""{part_label}\
        ### Chapter {self.chapter_number} — {self.title}
        ### Chapter Purpose
        {self.purpose}
        ### Main Events
        {self.main_events}
        ### Chapter Summary
        {self.chapter_summary}
        ### Chapter Notes
        {self.chapter_notes}
        """
        return s


    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)


    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    story_outline: StoryOutline = Relationship(
        back_populates="chapter_outlines")
    author: "User" = Relationship(back_populates="chapter_outlines")
    scene_outlines: List["SceneOutline"] = Relationship(
        back_populates="chapter_outline")
    queries: List["Query"] = Relationship(back_populates="chapter_outline")

    @property
    def current_scene_outlines(self) -> List["SceneOutlineRead"]:
        return [SceneOutlineRead.from_orm(x) for x in filter(lambda x: not x.invalidated, self.scene_outlines)]

    @property
    def all_scene_outlines(self):
        return self.scene_outlines

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_chapter(self) -> Optional["ChapterOutline"]:
        # This is a compensation for SOMETHING broken, TODO fix this
        out = [x for x in filter(lambda x: not x.invalidated, self.next_chapters)]
        return out[0] if len(out)>0 else None

    previous_chapter: Optional["ChapterOutline"] = Relationship(
        sa_relationship_kwargs={"remote_side": "ChapterOutline.id", "foreign_keys": "[ChapterOutline.previous_chapter_id]"},
        back_populates="next_chapters")
    next_chapters: List["ChapterOutline"] = Relationship(
        back_populates="previous_chapter")

class ChapterOutlineRead(ChapterOutlineBase):
    id: int = Field()
    author_id: int = Field()
    modified: bool = Field()
    is_public: bool = False
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: list[formats.ChapterOutlineInnerParsed] = Field()
    improved_parsed: list[formats.ChapterOutlineInnerParsed] = Field()

    # Relationships
    story_outline: StoryOutlineBase = Field()
    author: "User" = Field()
    # all_scene_outlines: List["SceneOutlineRead"] = Field()
    current_scene_outlines: List["SceneOutlineRead"] = Field()

    previous_chapter: Optional["ChapterOutlineRead"] = Field()
    next_chapter: Optional["ChapterOutlineRead"] = Field()

class ChapterOutlineReadRecursive(ChapterOutlineRead):
    current_scene_outlines: List["SceneOutlineReadRecursive"] = Field()

class ChapterOutlineReadQueries(ChapterOutlineRead):
    queries: List["QueryRead"] = Field()

"""
SceneOutline
"""
class SceneOutlineBase(BaseSQLModel):
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
    author_id: int = Field(foreign_key="users.id")

    @property
    def raw_parsed(self) -> list[formats.SceneOutlineInnerParsed]:
        if self.raw is None:
            return []
        return formats.parse_scene_outline(self.raw)['scenes']

    @property
    def improved_parsed(self) -> list[formats.SceneOutlineInnerParsed]:
        if self.improved is None:
            return []
        return formats.parse_scene_outline(self.improved)['scenes']

    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)


    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: "User" = Relationship(back_populates="scene_outlines")
    chapter_outline: ChapterOutline = Relationship(
        back_populates="scene_outlines")
    scenes: List["Scene"] = Relationship(back_populates="scene_outline")
    queries: List["Query"] = Relationship(back_populates="scene_outline")

    @property
    def current_scene(self) -> Optional["SceneRead"]:
        print('finding current scene', len(self.scenes))
        print('finding current scene', self.scenes is None)
        out =  [SceneRead.from_orm(x) for x in filter(lambda x: not x.invalidated, self.scenes)]
        return out[0] if len(out)>0 else None

    @property
    def all_scenes(self):
        return self.scenes

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_scene_outline(self) -> Optional["SceneOutline"]:
        print("is it this one?", self.next_scene_outlines is None)
        out = [x for x in filter(lambda x: not x.invalidated, self.next_scene_outlines)]
        return out[0] if len(out)>0 else None

    previous_scene_outline: Optional["SceneOutline"] = Relationship(
        sa_relationship_kwargs={"remote_side": "SceneOutline.id", "foreign_keys": "[SceneOutline.previous_scene_id]", },
        back_populates="next_scene_outlines")
    next_scene_outlines: List["SceneOutline"] = Relationship(
        back_populates="previous_scene_outline")


class SceneOutlineRead(SceneOutlineBase):
    id: int = Field()
    author_id: int = Field()
    modified: bool = Field()
    is_public: bool = False
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: list[formats.SceneOutlineInnerParsed] = Field()
    improved_parsed: list[formats.SceneOutlineInnerParsed] = Field()

    # Relationships
    author: "User" = Field()
    chapter_outline: ChapterOutline = Field()
    # all_scenes: List["SceneRead"] = Field()
    current_scene: Optional["SceneRead"] = Field()

    previous_scene_outline: Optional["SceneOutlineRead"] = Field()
    next_scene_outline: Optional["SceneOutlineRead"] = Field()

class SceneOutlineReadRecursive(SceneOutlineRead):
    pass

class SceneOutlineReadQueries(SceneOutlineRead):
    queries: List["QueryRead"] = Field()

"""
Scene
"""

class SceneBase(BaseSQLModel):
    scene_outline_id: int = Field(
        foreign_key="scene_outlines.id")

    # we don't track this right now because scenes might not be gened. whereas outlines are
    previous_scene_id: Optional[int] = Field(
        default=None, foreign_key="scenes.id")

    scene_number: int = Field()
    outline: str = Field()

    # GPT Generated
    raw: Optional[str] = Field(default=None)
    edit_notes: Optional[str] = Field(default=None)
    improved: Optional[str] = Field(default=None)
    final_text: Optional[str] = Field(default=None)

class Scene(SceneBase, table=True):
    __tablename__ = 'scenes' # type: ignore
    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(default=None, foreign_key="users.id")

    @property
    def raw_parsed(self) -> list[formats.SceneTextInnerParsed]:
        if self.raw is None:
            return []
        return formats.parse_scene_text(self.raw)['sections']

    @property
    def improved_parsed(self) -> list[formats.SceneTextInnerParsed]:
        if self.improved is None:
            return []
        return formats.parse_scene_text(self.improved)['sections']

    @property
    def raw_text(self) -> str:
        print('target1')
        if self.raw is None:
            return ''
        d = formats.parse_scene_text(self.raw)
        out = []
        for section in d['sections']:
            out.append(section['content'])
        t = "\n\n".join(out)
        print(t)
        return t

    @property
    def improved_text(self) -> str:
        print('target2')
        if self.improved is None:
            return ''
        d = formats.parse_scene_text(self.improved)
        out = []
        for section in d['sections']:
            out.append(section['content'])
        t = "\n\n".join(out)
        print(t)
        return t

    modified: bool = Field(default=False)
    invalidated: bool = Field(default=False)



    created_on: datetime = Field(default_factory=datetime.now)
    updated_on: datetime = Field(default_factory=datetime.now)

    # Relationships
    author: "User" = Relationship(back_populates="scenes")
    scene_outline: "SceneOutline" = Relationship(back_populates="scenes")
    queries: List["Query"] = Relationship(back_populates="scene")

    # workaround for sqlalchemy being a dick about one-to-one self references
    @property
    def next_scene(self) -> Optional["Scene"]:
        print('nextxcene?', self.next_scenes is None)
        out = [x for x in filter(lambda x: not x.invalidated, self.next_scenes)]
        return out[0] if len(out)>0 else None

    previous_scene: Optional["Scene"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Scene.id", "foreign_keys": "[Scene.previous_scene_id]", "uselist": False},
        back_populates="next_scenes")
    next_scenes: List["Scene"] = Relationship(
        back_populates="previous_scene")


class SceneRead(SceneBase):
    id: int = Field()
    author_id: int = Field()
    modified: bool = Field()
    is_public: bool = False
    invalidated: bool = Field()
    created_on: datetime = Field()
    updated_on: datetime = Field()

    raw_parsed: list[formats.SceneTextInnerParsed] = Field()
    improved_parsed: list[formats.SceneTextInnerParsed] = Field()

    raw_text: str = Field()
    improved_text: str = Field()

    # Relationships
    author: "User" = Field()
    scene_outline: SceneOutline = Field()

    # we don't track this right now
    previous_scene: Optional["SceneRead"] = Field()
    next_scene: Optional["SceneRead"] = Field()

class SceneReadQueries(SceneRead):
    queries: List["QueryRead"] = Field()
