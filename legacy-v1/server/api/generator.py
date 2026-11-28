from fastapi import Depends, HTTPException, status, APIRouter
from sqlmodel import Session, select
from fastapi.responses import StreamingResponse

from ..models import Story, StoryOutline, ChapterOutline, SceneOutline, Scene, Query, ApiCall
from .. import orchestrator
from ..dependencies import GetDbObject
from ..database import get_db_session


router = APIRouter()


def sse_convert(string):
    """
    Convert a string to Server-Sent Events format.
    """
    encoded = string.replace("\n", "%0A")
    return f"data: {encoded}\n"
    return "\n".join(f"data: {line}" for line in string.split("\n")) + "\n"

    return f"data: {data}\n\n"

def generator_pipeline(gen):
    yield f"event: chunks\n"
    for result in gen:
        if isinstance(result, str):
            y =  sse_convert(result)
            # print("last yield", y)
            yield y
        elif result is None:
            continue
        elif isinstance(result, orchestrator.MidPoint):
            yield f"\n\nevent: mid_point\n"
            yield f"data: {result.step_name}\n\n"
            yield f"event: chunks\n"
        else:
            yield f"\n\nevent: result\n"
            yield f"data: {result.json()}\n\n"

def generate_story_base(story: Story, session: Session):

    gen = orchestrator.generate_story(story, session)

    yield from generator_pipeline(gen)


def generate_story_outline(story_outline: StoryOutline, session: Session):

    gen = orchestrator.generate_story_outline(story_outline, session)

    yield from generator_pipeline(gen)


def generate_chapter_outline(chapter: ChapterOutline, session: Session):

    gen = orchestrator.generate_chapter_outline(chapter, session)

    yield from generator_pipeline(gen)


def generate_scene_outline(scene: SceneOutline, session: Session):

    gen = orchestrator.generate_scene_outline(scene, session)

    yield from generator_pipeline(gen)


def generate_scene_text(scene: Scene, session: Session):

    gen = orchestrator.generate_scene_text(scene, session)

    yield from generator_pipeline(gen)


@router.get("/story/{obj_id}", response_class=StreamingResponse)
async def story_sse(story: Story = Depends(GetDbObject(True, model=Story)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_story_base(story, session), media_type="text/event-stream")

@router.get("/story-outline/{obj_id}", response_class=StreamingResponse)
async def story_outline_sse(story_outline: StoryOutline = Depends(GetDbObject(True, model=StoryOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_story_outline(story_outline, session), media_type="text/event-stream")

@router.get("/chapter-outline/{obj_id}", response_class=StreamingResponse)
async def chapter_outline_sse(chapter_outline: ChapterOutline = Depends(GetDbObject(True, model=ChapterOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_chapter_outline(chapter_outline, session), media_type="text/event-stream")

@router.get("/scene-outline/{obj_id}", response_class=StreamingResponse)
async def scene_outline_sse(scene_outline: SceneOutline = Depends(GetDbObject(True, model=SceneOutline)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_scene_outline(scene_outline, session), media_type="text/event-stream")

@router.get("/scene/{obj_id}", response_class=StreamingResponse)
async def scene_sse(scene: Scene = Depends(GetDbObject(True, model=Scene)), session: Session = Depends(get_db_session)):
    return StreamingResponse(generate_scene_text(scene, session), media_type="text/event-stream")


