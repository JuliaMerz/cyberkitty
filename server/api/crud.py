from fastapi import APIRouter, Depends, HTTPException, status
from typing import cast, Annotated
from sqlmodel import Session, Field
from ..models import StoryBase, StoryOutlineBase, User, QueryBase, ApiCallBase, ChapterOutlineBase, SceneOutlineBase, SceneBase, Story, StoryOutline, Query, ApiCall, ChapterOutline, SceneOutline, Scene, StoryRead, StoryReadRecursive, StoryOutlineRead, QueryRead, ChapterOutlineRead, SceneOutlineRead, SceneRead
from ..database import get_db_session
from ..dependencies import GetDbObject
from ..auth_config import get_current_user

router = APIRouter()

"""
Story
"""
@router.post("/story/", response_model=StoryBase)
def create_story(story: StoryBase, session: Session = Depends(get_db_session), current_user: User = Depends(get_current_user)):
    story.author_id = cast(int, current_user.id)
    session.add(story)
    session.commit()
    session.refresh(story)
    return story

@router.get("/story/{obj_id}", response_model=StoryRead)
def read_story(obj_id: int, story: Annotated[Story, Depends(GetDbObject(will_mutate=False, model=Story))]):
    return story

@router.get("/story/{obj_id}/recursive", response_model=StoryReadRecursive)
def read_story_recursive(obj_id: int, story: Annotated[Story, Depends(GetDbObject(will_mutate=False, model=Story))]):
    return story

class StoryUpdate(StoryBase):
    id: int

@router.put("/story/{obj_id}", response_model=StoryBase)
def update_story(obj_id: int, story_update: StoryUpdate, session: Session = Depends(get_db_session), story: Story = Depends(GetDbObject(True, model=Story))):
    story_data = story_update.dict(exclude_unset=True)
    for key, value in story_data.items():
        setattr(story, key, value)
    story.modified = True
    session.add(story)
    session.commit()
    session.refresh(story)
    return story

"""
Story Outline
"""

@router.get("/story-outline/{obj_id}", response_model=StoryOutlineRead)
def read_story_outline(obj_id: int, story_outline: StoryOutline = Depends(GetDbObject(False, model=StoryOutline))):
    return story_outline

class StoryOutlineUpdate(StoryOutlineBase):
    id: int

@router.put("/story-outline/{obj_id}", response_model=StoryOutlineRead)
def update_story_outline(obj_id: int, story_outline_update: StoryOutlineUpdate, session: Session = Depends(get_db_session), story_outline: StoryOutline = Depends(GetDbObject(True, model=StoryOutline))):
    story_outline_data = story_outline_update.dict(exclude_unset=True)
    for key, value in story_outline_data.items():
        setattr(story_outline, key, value)
    story_outline.modified = True
    session.add(story_outline)
    session.commit()
    session.refresh(story_outline)
    return story_outline

"""
Chapter Outline
"""

@router.get("/chapter-outline/{obj_id}", response_model=ChapterOutlineRead)
def read_chapter_outline(obj_id: int, chapter_outline: ChapterOutline = Depends(GetDbObject(False, model=ChapterOutline))):
    return chapter_outline

class ChapterOutlineUpdate(ChapterOutlineBase):
    id: int

@router.put("/chapter-outline/{obj_id}", response_model=ChapterOutlineRead)
def update_chapter_outline(obj_id: int, chapter_outline_update: ChapterOutlineUpdate, session: Session = Depends(get_db_session), chapter_outline: ChapterOutline = Depends(GetDbObject(True, model=ChapterOutline))):
    chapter_outline_data = chapter_outline_update.dict(exclude_unset=True)
    for key, value in chapter_outline_data.items():
        setattr(chapter_outline, key, value)
    chapter_outline.modified = True
    session.add(chapter_outline)
    session.commit()
    session.refresh(chapter_outline)
    return chapter_outline

"""
Scene Outline
"""
@router.get("/scene-outline/{obj_id}", response_model=SceneOutlineRead)
def read_scene_outline(obj_id: int, scene_outline: SceneOutline = Depends(GetDbObject(False, model=SceneOutline))):
    return scene_outline

class SceneOutlineUpdate(SceneOutlineBase):
    id: int

@router.put("/scene-outline/{obj_id}", response_model=SceneOutlineRead)
def update_scene_outline(obj_id: int, scene_outline_update: SceneOutlineUpdate, session: Session = Depends(get_db_session), scene_outline: SceneOutline = Depends(GetDbObject(True, model=SceneOutline))):
    scene_outline_data = scene_outline_update.dict(exclude_unset=True)
    for key, value in scene_outline_data.items():
        setattr(scene_outline, key, value)
    scene_outline.modified = True
    session.add(scene_outline)
    session.commit()
    session.refresh(scene_outline)
    return scene_outline

"""
Scene
"""

@router.get("/scene/{obj_id}", response_model=SceneRead)
def read_scene(obj_id: int, scene: Scene = Depends(GetDbObject(False, model=Scene))):
    return scene

class SceneUpdate(SceneBase):
    id: int

@router.put("/scene/{obj_id}", response_model=SceneRead)
def update_scene(obj_id: int, scene_update: SceneUpdate, session: Session = Depends(get_db_session), scene: Scene = Depends(GetDbObject(True, model=Scene))):
    scene_data = scene_update.dict(exclude_unset=True)
    for key, value in scene_data.items():
        setattr(scene, key, value)
    session.add(scene)
    session.commit()
    session.refresh(scene)
    return scene

