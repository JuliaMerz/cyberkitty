from fastapi import Depends, HTTPException, status, APIRouter
from sqlmodel import Session, select
from fastapi.responses import StreamingResponse

from ..models import Story, StoryOutline, ChapterOutline, SceneOutline, Scene, Query, ApiCall
from . import generator
from ..dependencies import GetDbObject
from ..database import get_db_session


router = APIRouter()


def sse_convert(string):
    """
    Convert a string to Server-Sent Events format.
    """
    return "\n".join(f"data: {line}" for line in string.split("\n")) + "\n\n"

    return f"data: {data}\n\n"


def generate_story_base(story: Story, session: Session):

    story = generator.generate_story(story, session)

    yield f"data: {story.json()}\n\n"


def generate_story_outline(story_outline: StoryOutline, session: Session):

    gen = generator.generate_story_outline(story_outline, session)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.json()}\n\n"  # type: ignore
            # this should be the last item but we break anyway
            break


def generate_chapter_outline(chapter: ChapterOutline, session: Session):

    gen = generator.generate_chapter_outline(chapter, session)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.json()}\n\n"  # type: ignore
            # this should be the last item but we break anyway
            break


def generate_scene_outline(scene_id, session: Session):
    scene = session.get(SceneOutline, scene_id)

    if not scene:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="scene not found")

    gen = generator.generate_scene_outline(scene, session)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.json()}\n\n"  # type: ignore
            # this should be the last item but we break anyway
            break


def generate_scene_text(scene_id, session: Session):
    scene = session.get(Scene, scene_id)

    if not scene:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="scene not found")

    gen = generator.generate_scene_text(scene, session)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.json()}\n\n"  # type: ignore
            # this should be the last item but we break anyway
            break


@router.get("/story/{story_id}", response_class=StreamingResponse)
async def story_sse(story_id: int, story: Story = Depends(GetDbObject(True, model=Story)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_story_base(story, session), media_type="text/event-stream")

@router.get("/story_outline/{story_outline_id}", response_class=StreamingResponse)
async def story_outline_sse(story_outline_id: int, story_outline: StoryOutline = Depends(GetDbObject(True, model=StoryOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_story_outline(story_outline, session), media_type="text/event-stream")

@router.get("/chapter_outline/{chapter_outline_id}", response_class=StreamingResponse)
async def chapter_outline_sse(chapter_outline_id: int, chapter_outline: ChapterOutline = Depends(GetDbObject(True, model=ChapterOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_chapter_outline(chapter_outline, session), media_type="text/event-stream")

@router.get("/scene_outline/{scene_outline_id}", response_class=StreamingResponse)
async def scene_outline_sse(scene_outline_id: int, scene_outline: SceneOutline = Depends(GetDbObject(True, model=SceneOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_scene_outline(scene_outline, session), media_type="text/event-stream")

@router.get("/scene/{scene_id}", response_class=StreamingResponse)
async def scene_sse(scene_id: int, scene: Scene = Depends(GetDbObject(True, model=Scene)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_scene_text(scene, session), media_type="text/event-stream")


