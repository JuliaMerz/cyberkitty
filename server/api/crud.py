from fastapi import APIRouter, Depends, HTTPException, status
from typing import cast, Annotated
from sqlmodel import Session
from server.models import Story, StoryOutline, User, Query, ApiCall, ChapterOutline, SceneOutline, Scene
from server.database import get_db_session
from server.dependencies import GetDbObject
from server.auth_config import get_current_user

router = APIRouter()

"""
Story
"""
@router.post("/story/", response_model=Story)
def create_story(story: Story, session: Session = Depends(get_db_session), current_user: User = Depends(get_current_user)):
    story.author_id = cast(int, current_user.id)
    session.add(story)
    session.commit()
    session.refresh(story)
    return story

@router.get("/story/{obj_id}", response_model=Story)
def read_story(obj_id: int, story: Annotated[Story, Depends(GetDbObject(will_mutate=False, model=Story))]):
    return story

@router.put("/story/{obj_id}", response_model=Story)
def update_story(obj_id: int, story_update: Story, session: Session = Depends(get_db_session), story: Story = Depends(GetDbObject(True, model=Story))):
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

@router.get("/story-outline/{obj_id}", response_model=StoryOutline)
def read_story_outline(obj_id: int, story_outline: StoryOutline = Depends(GetDbObject(False, model=StoryOutline))):
    return story_outline

@router.put("/story-outline/{obj_id}", response_model=StoryOutline)
def update_story_outline(obj_id: int, story_outline_update: StoryOutline, session: Session = Depends(get_db_session), story_outline: StoryOutline = Depends(GetDbObject(True, model=StoryOutline))):
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

@router.get("/chapter-outline/{obj_id}", response_model=ChapterOutline)
def read_chapter_outline(obj_id: int, chapter_outline: ChapterOutline = Depends(GetDbObject(False, model=ChapterOutline))):
    return chapter_outline

@router.put("/chapter-outline/{obj_id}", response_model=ChapterOutline)
def update_chapter_outline(obj_id: int, chapter_outline_update: ChapterOutline, session: Session = Depends(get_db_session), chapter_outline: ChapterOutline = Depends(GetDbObject(True, model=ChapterOutline))):
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
@router.get("/scene-outline/{obj_id}", response_model=SceneOutline)
def read_scene_outline(obj_id: int, scene_outline: SceneOutline = Depends(GetDbObject(False, model=SceneOutline))):
    return scene_outline


@router.put("/scene-outline/{obj_id}", response_model=SceneOutline)
def update_scene_outline(obj_id: int, scene_outline_update: SceneOutline, session: Session = Depends(get_db_session), scene_outline: SceneOutline = Depends(GetDbObject(True, model=SceneOutline))):
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

@router.get("/scene/{obj_id}", response_model=Scene)
def read_scene(obj_id: int, scene: Scene = Depends(GetDbObject(False, model=Scene))):
    return scene

@router.put("/scene/{obj_id}", response_model=Scene)
def update_scene(obj_id: int, scene_update: Scene, session: Session = Depends(get_db_session), scene: Scene = Depends(GetDbObject(True, model=Scene))):
    scene_data = scene_update.dict(exclude_unset=True)
    for key, value in scene_data.items():
        setattr(scene, key, value)
    session.add(scene)
    session.commit()
    session.refresh(scene)
    return scene

