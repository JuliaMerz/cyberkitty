from pydantic import BaseModel, ConfigDict
from datetime import datetime


"""
We use this for our SSE updates for showing the user the progress of their generation.
"""


class PreviewOutput(BaseModel):
    preview: str


"""
User Fields
"""


class CreateUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str | None
    email: str | None
    tokens: float


class GetUser(CreateUser):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_on: datetime
    updated_on: datetime


"""
Story Fields
"""


class CreateStory(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str | None
    author_id: int | None
    description: str | None
    style: str | None
    themes: str | None


class UpdateStory(CreateStory):
    id: int

    setting: str | None
    main_characters: str | None
    summary: str | None


class GetStory(UpdateStory):
    modified: bool
    invalidated: bool
    created_on: datetime
    updated_on: datetime


class UpdateStoryOutline(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    outline_paragraphs: str | None


class GetStoryOutline(UpdateStoryOutline):
    model_config = ConfigDict(from_attributes=True)

    author_id: int | None
    story_id: int | None
    outline_onesentence: str | None
    outline_mainevents: str | None
    editing_notes: str | None
    fact_sheets: str | None
    characters: str | None
    modified: bool
    invalidated: bool
    created_on: datetime
    updated_on: datetime


class UpdateChapterOutline(BaseModel):
    id: int
    improved: str | None


class GetChapterOutline(UpdateChapterOutline):
    model_config = ConfigDict(from_attributes=True)

    author_id: int | None
    story_outline_id: int | None
    chapter_number: int | None
    title: str | None
    purpose: str | None
    main_events: str | None
    paragraph_summary: str | None
    chapter_notes: str | None
    raw: str | None
    edit_notes: str | None
    modified: bool
    invalidated: bool
    created_on: datetime
    updated_on: datetime


class UpdateSceneOutline(BaseModel):
    id: int
    improved: str | None


class SceneOutline(UpdateSceneOutline):
    model_config = ConfigDict(from_attributes=True)

    author_id: int | None
    chapter_outline_id: int | None
    scene_number: int | None
    previous_scene_id: int | None
    setting: str | None
    primary_function: str | None
    secondary_function: str | None
    outline: str | None
    raw: str | None
    edit_notes: str | None
    modified: bool
    invalidated: bool
    created_on: datetime
    updated_on: datetime


class UpdateScene(BaseModel):

    id: int
    improved: str | None


class GetScene(UpdateScene):
    model_config = ConfigDict(from_attributes=True)

    author_id: int | None
    scene_outline_id: int | None
    scene_number: int | None
    previous_scene_id: int | None
    raw: str | None
    edit_notes: str | None
    modified: bool
    invalidated: bool
    created_on: datetime
    updated_on: datetime


class Query(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_id: int | None
    continues: int
    retries: int
    total_cost: float
    original_prompt: str
    # Assuming JSON field is represented as a dictionary
    previous_messages: list[dict] | None
    # Assuming JSON field is represented as a dictionary
    all_messages: list[dict] | None
    complete_output: str
    created_on: datetime
    updated_on: datetime


class ApiCall(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    timestamp: datetime
    query_id: int
    success: bool
    error: str | None
    cost: float | None
    # Assuming JSON field is represented as a dictionary
    input_messages: list[dict] | None
    output: str
    created_on: datetime
    updated_on: datetime
