
from collections.abc import Generator
from fastapi import HTTPException
from typing import cast
from sqlmodel import Session
from pydantic import BaseModel
from .models import User, Story, StoryOutline, ChapterOutline, SceneOutline, Scene, Query, ApiCall, StoryRead, StoryOutlineRead, ChapterOutlineRead, SceneOutlineRead, SceneRead
from . import formats
from . import prompt_generator
from . import error
from .executor import query_executor

MAX_RETRIES = 1

# skip 4th step of story outline to save $$
SKIP_STEP_4 = True

class MidPoint(BaseModel):
    step: int
    step_name: str
    pass


def generate_story(story: Story, db_session: Session, retry_count=0) -> Generator[str | Story | StoryRead, None, None]:
    """
    Generate a new story, filling in the setting, main character, and summary fields of a model.

    As a consequence, also creates a stub story outline, that the user can then request to be filled in.
    """

    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes, story.request)
    story_prompt = prompt_generator.generate_story_base()

    query_result_stream = query_executor(db_session, sys_prompt, story_prompt, story.author, story)

    for chunk in query_result_stream:
        if isinstance(chunk, str):
            yield chunk
        elif chunk is None:
            continue
        else:
            query_result = chunk
            try:
                d = formats.parse_story_base(query_result.complete_output)
                story.tags = d['tags']
                story.setting = d['setting']
                story.main_characters = d['main_characters']
                story.summary = d['summary']


                if story.id is None:
                    raise HTTPException(status_code=500, detail="Story must be saved before generating outline.")
                outline = StoryOutline(story_id=story.id, author_id=story.author_id)


                count = db_session.query(StoryOutline).filter(StoryOutline.story_id == story.id).update({StoryOutline.invalidated:True})
                print("invalidated : ", count)
                story_outline = db_session.add(outline)
                story.modified = False
                db_session.add(story)
                db_session.commit()
                db_session.refresh(story)


                # SQLAlchemy HATES this and we can just refresh from the frontend, still: TODO
                # yield StoryRead.from_orm(story)
                yield story
                break
            except (KeyError, formats.ParsingError):
                print("ERROR PARSING, RETRYING")
                # attempt query one more time, then escalate to an API failure
                if retry_count < MAX_RETRIES:
                    yield from generate_story(story, db_session, retry_count + 1)
                    break



def generate_story_outline(story_outline: StoryOutline, db_session: Session) -> Generator[str | MidPoint | StoryOutline | StoryOutlineRead, None, None]:
    """
    Algorithm:

    For each step we generate the prompts, then send to api along with the messages from the previous step.

    """
    yield MidPoint(step=0, step_name="Generating One Sentence Outline")
    story = story_outline.story
    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes, story.request,
        setting=story.setting, main_characters=story.main_characters, summary=story.summary)

    # Step 1: Generate one-sentence outline
    prompt_1 = prompt_generator.generate_story_outline_step_1()

    query_result_1 = None
    splits = None

    try:
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, story_outline)

        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                _test = formats.parse_story_outline_simple(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, story_outline)

        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                _test = formats.parse_story_outline_simple(splits['outline'])
                break

    if query_result_1 is None or splits is None:
        raise error.OrchestrationError("Orchestration failure at generate story outline step 1")
    # Get the outline and yield it and save it.
    story_outline.outline_onesentence = splits['outline']
    db_session.commit()
    db_session.refresh(story_outline)

    yield MidPoint(step=1, step_name="Generating Improved Outline")

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_story_outline_step_2()

    query_result_2 = None
    splits = None
    try:
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, story_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_story_outline_medium(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        # attempt query one more time, then escalate to an API failure
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, story_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_story_outline_medium(splits['outline'])
                break

    if query_result_2 is None or splits is None:
        raise error.OrchestrationError("Orchestration failure at generate story outline step 2")
    story_outline.outline_mainevents_raw = splits['outline']

    db_session.commit()
    db_session.refresh(story_outline)

    yield MidPoint(step=2, step_name="Generating Expanded Outline")

    # Step 3: Edit and improve the outline
    prompt_3 = prompt_generator.generate_story_outline_step_3(story_outline.outline_mainevents_raw, SKIP_STEP_4)

    query_result_3 = None
    splits = None

    try:
        query_result_stream_3 = query_executor(db_session,
            sys_prompt, prompt_3, story.author, story_outline)

        for chunk in query_result_stream_3:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_3 = chunk
                splits = formats.split_sections(query_result_3.complete_output)
                _test = formats.parse_story_outline_medium(splits['outline'])
                break

    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_3 = query_executor(db_session,
            sys_prompt, prompt_3, story.author, story_outline)

        for chunk in query_result_stream_3:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_3 = chunk
                splits = formats.split_sections(query_result_3.complete_output)
                _test = formats.parse_story_outline_medium(splits['outline'])
                break

    if query_result_3 is None or splits is None:
        raise error.OrchestrationError("Orchestration failure at generate story outline step 3")

    story_outline.editing_notes = splits['editing_notes']
    story_outline.outline_mainevents_improved = splits['outline']


    if SKIP_STEP_4:
        story_outline.outline_paragraphs = story_outline.outline_mainevents_improved

    db_session.commit()
    db_session.refresh(story_outline)



    if not SKIP_STEP_4:
        yield MidPoint(step=3, step_name="Generating Paragraph Outline")

        # Step 4: Expand the outline with paragraph summary and notes
        prompt_4 = prompt_generator.generate_story_outline_step_4(story_outline.outline_mainevents_improved)


        query_result_4 = None
        splits = None

        try:
            query_result_stream_4 = query_executor(db_session,
                sys_prompt, prompt_4, story.author, story_outline)

            for chunk in query_result_stream_4:
                if isinstance(chunk, str):
                    yield chunk
                elif chunk is None:
                    continue
                else:
                    query_result_4 = chunk
                    splits = formats.split_sections(query_result_4.complete_output)
                    _test = formats.parse_story_outline_complex(splits['outline'])
                    break

        except (KeyError, formats.ParsingError):
            print("ERROR PARSING, RETRYING")
            # attempt query one more time, then escalate to an API failure
            query_result_stream_4 = query_executor(db_session,
                sys_prompt, prompt_4, story.author, story_outline)

            for chunk in query_result_stream_4:
                if isinstance(chunk, str):
                    yield chunk
                elif chunk is None:
                    continue
                else:
                    query_result_4 = chunk
                    splits = formats.split_sections(query_result_4.complete_output)
                    _test = formats.parse_story_outline_complex(splits['outline'])
                    break

        if query_result_4 is None or splits is None:
            raise error.OrchestrationError("Orchestration failure at generate story outline step 4")


        story_outline.outline_paragraphs = splits['outline']
        db_session.commit()


    # Finally: Generate chapter stubs
    previous_chapter = None
    count = db_session.query(ChapterOutline).filter(ChapterOutline.story_outline_id == story_outline.id).update({ChapterOutline.invalidated:True})
    print("invalidated : ", count)
    for chapter in story_outline.outline_paragraphs_parsed:
        print("SAVING CHAPTER", chapter['chapter_number'])
        chapter_outline = ChapterOutline(story_outline_id=cast(int, story_outline.id),
                                         author_id=story_outline.author_id,
                                         previous_chapter_id=previous_chapter.id if previous_chapter else None,
                                         part_label=chapter['part_label'],
                                         chapter_notes=chapter['notes'],
                                         chapter_number=int(chapter['chapter_number']),
                                         title=chapter['title'],
                                         purpose=chapter['chapter_purpose'],
                                         main_events=chapter['main_events'],
                                         chapter_summary=chapter['chapter_summary'])
        previous_chapter = chapter_outline
        db_session.add(chapter_outline)
    story_outline.story.modified = False
    db_session.add(story_outline.story)
    db_session.commit()
    db_session.refresh(story_outline)

    # SQLAlchemy HATES this and we can just refresh from the frontend, still: TODO
    # yield StoryOutlineRead.from_orm(story_outline)
    yield story_outline


def generate_chapter_outline(chapter_outline: ChapterOutline, db_session: Session) -> Generator[str | MidPoint | ChapterOutline | ChapterOutlineRead, None, None]:

    yield MidPoint(step=1, step_name="Creating Outline")
    story_outline = chapter_outline.story_outline
    story = story_outline.story
    sys_prompt = prompt_generator.generate_system_instruction(
        story.description,
        story.style,
        story.themes,
        story.request,
        setting=story.setting,
        main_characters=story.main_characters,
        summary=story.summary,
        outline=story_outline.computed_story_outline,
        fact_sheet=story_outline.fact_sheets,
        characters=story_outline.characters)

    # Step 1: Generate a raw outline
    prompt_1 = prompt_generator.generate_chapter_outline_step_1(
        str(chapter_outline.chapter_number),
        chapter_outline.title,
        chapter_outline.purpose,
        chapter_outline.chapter_summary,
        chapter_outline.main_events,
        chapter_outline.chapter_notes)

    query_result_1 = None
    splits = None

    try:
        query_result_stream_1= query_executor(db_session, sys_prompt, prompt_1, story.author, chapter_outline)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                print(splits)
                _test = formats.parse_chapter_outline(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, chapter_outline)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                _test = formats.parse_chapter_outline(splits['outline'])
                break

    if query_result_1 is None or splits is None:
        print("Error source: ", query_result_1, splits)
        raise error.OrchestrationError("Orchestration failure at generate chapter outline step 1")
    # Get the outline and yield it and save it.
    chapter_outline.raw = splits['outline']
    db_session.commit()
    db_session.refresh(chapter_outline)

    yield MidPoint(step=2, step_name="Editing Outline")

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_chapter_outline_step_2(
                                    str(chapter_outline.chapter_number),
                                    chapter_outline.title,
                                    chapter_outline.purpose,
                                    chapter_outline.chapter_summary,
                                    chapter_outline.main_events,
                                    chapter_outline.chapter_notes)

    query_result_2 = None
    splits = None
    try:
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, chapter_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_chapter_outline(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, chapter_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_chapter_outline(splits['outline'])
                break

    if query_result_2 is None or splits is None:
        print("Error source: ", query_result_2, splits)
        raise error.OrchestrationError("Orchestration failure at generate chapter outline step 2")
    chapter_outline.edit_notes = splits['editing_notes']
    chapter_outline.improved = splits['outline']
    db_session.commit()
    db_session.refresh(chapter_outline)

    # Step Z: Generate scene stubs
    count = db_session.query(SceneOutline).filter(SceneOutline.chapter_outline_id == chapter_outline.id).update({SceneOutline.invalidated:True})
    print("invalidated : ", count)
    previous_scene: SceneOutline | None = None
    for scene in chapter_outline.improved_parsed:
        scene_outline = SceneOutline(chapter_outline_id=cast(int, chapter_outline.id),
                                     author_id=chapter_outline.author_id,
                                     previous_scene_id=previous_scene.id if previous_scene else None,
                                     scene_number=int(scene['scene_number']),
                                     setting=scene['setting'],
                                     primary_function=scene['primary_function'],
                                     secondary_function=scene['secondary_function'],
                                     summary=scene['summary'],
                                     context=scene['context'])
        previous_scene = scene_outline
        db_session.add(scene_outline)
    chapter_outline.modified = False
    db_session.commit()
    db_session.refresh(chapter_outline)
    # db_session.refresh(chapter_outline.story_outline)

    # SQLAlchemy HATES this and we can just refresh from the frontend, still: TODO
    # yield ChapterOutlineRead.from_orm(chapter_outline)
    yield chapter_outline


def generate_scene_outline(scene_outline: SceneOutline, db_session: Session) -> Generator[str | MidPoint | SceneOutline | SceneOutlineRead, None, None]:

    yield MidPoint(step=1, step_name="Creating Outline")
    chapter_outline = scene_outline.chapter_outline
    story_outline = chapter_outline.story_outline
    story = story_outline.story

    sys_prompt = prompt_generator.generate_system_instruction(
                                    story.description,
                                    story.style,
                                    story.themes,
                                    story.request,
                                    setting=story.setting,
                                    main_characters=story.main_characters,
                                    summary=story.summary,
                                    outline=story_outline.computed_story_outline,
                                    fact_sheet=story_outline.fact_sheets,
                                    characters=story_outline.characters)

    if chapter_outline.improved is None:
        raise error.OrchestrationError("Chapter outline must be generated before generating scene outline.")

    previous_scene_outline: SceneOutline | None = db_session.get(SceneOutline, scene_outline.previous_scene_id)
    # Step 1: Generate a raw outline
    # this is basically incomprehensible, but our language server assisted us in writing
    # this and now we must never change argument order again.
    prompt_1 = prompt_generator.generate_scene_outline_step_1(chapter_outline.improved,
                                                              str(scene_outline.scene_number),
                                                              scene_outline.setting,
                                                              scene_outline.primary_function,
                                                              scene_outline.secondary_function,
                                                              scene_outline.summary,
                                                              scene_outline.context,
                                                              previous_scene_outline.improved if previous_scene_outline else None,
                                                              chapter_outline.previous_chapter.improved if chapter_outline.previous_chapter else None)

    query_result_1 = None
    splits = None
    try:
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, scene_outline)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                print(splits)
                _test = formats.parse_scene_outline(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, scene_outline)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                _test = formats.parse_scene_outline(splits['outline'])
                break
    if query_result_1 is None or splits is None:
        print("Error source: ", query_result_1, splits)
        raise error.OrchestrationError("Orchestration failure at generate scene outline step 1")

    # Get the outline and yield it and save it.
    scene_outline.raw = splits['outline']
    db_session.commit()
    db_session.refresh(scene_outline)

    yield MidPoint(step=2, step_name="Editing Outline")

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_scene_outline_step_2(chapter_outline.improved,
                                                              str(scene_outline.scene_number),
                                                              scene_outline.setting,
                                                              scene_outline.primary_function,
                                                              scene_outline.secondary_function,
                                                              scene_outline.summary,
                                                              scene_outline.context)

    query_result_2 = None
    splits = None
    try:
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, chapter_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_scene_outline(splits['outline'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_2 = query_executor(db_session,
            sys_prompt, prompt_2, story.author, chapter_outline, query_result_1.all_messages)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_scene_outline(splits['outline'])
                break

    if query_result_2 is None or splits is None:
        print("Error source: ", query_result_2, splits)
        raise error.OrchestrationError("Orchestration failure at generate chapter outline step 2")

    scene_outline.edit_notes = splits['editing_notes']
    scene_outline.improved = splits['outline']
    scene_outline.modified = False
    db_session.commit()
    db_session.refresh(scene_outline)

    # SQLAlchemy HATES this and we can just refresh from the frontend, still: TODO
    # yield SceneOutlineRead.from_orm(scene_outline)
    yield scene_outline

    generate_scene_stub(story, scene_outline, db_session)


def generate_scene_stub(story:Story, scene_outline: SceneOutline, db_session: Session):

    # Step 3: Generate scene stub

    count = db_session.query(Scene).filter(Scene.scene_outline_id == scene_outline.id).update({Scene.invalidated:True})


    print("invalidated : ", count)
    scene = Scene(author_id=story.author_id,
                  outline=cast(str, scene_outline.improved),
                  scene_outline_id=cast(int, scene_outline.id),
                  scene_number=scene_outline.scene_number)
    db_session.add(scene)
    db_session.commit()

    return scene_outline


def generate_scene_text(scene: Scene, db_session: Session) -> Generator[str | MidPoint | Scene | SceneRead, None, None]:

    yield MidPoint(step=1, step_name="Creating Scene")

    scene_outline = scene.scene_outline
    chapter_outline = scene_outline.chapter_outline
    story_outline = chapter_outline.story_outline
    story = story_outline.story

    sys_prompt = prompt_generator.generate_system_instruction(
                                story.description,
                                story.style,
                                story.themes,
                                story.request,
                                setting=story.setting,
                                main_characters=story.main_characters,
                                summary=story.summary,
                                outline=story_outline.computed_story_outline,
                                fact_sheet=story_outline.fact_sheets,
                                characters=story_outline.characters)

    previous_chapter_outline = db_session.get(ChapterOutline, chapter_outline.previous_chapter_id)
    previous_scene_outline = db_session.get(SceneOutline, scene_outline.previous_scene_id)
    previous_scene = db_session.get(Scene, scene.previous_scene_id)

    # potentially add all the chapter's scenes (expensive!)
    # previous_text = "\n\n#\n\n".join(
    #     [scene_outline.current_scene.improved_text for scene_outline in [previous_scene_outline])

    previous_text = previous_scene.improved_text if previous_scene else None

    print(previous_text)

    if chapter_outline.improved is None or scene_outline.improved is None:
        raise error.OrchestrationError("Chapter outline and scene outline must be generated before generating scene text.")
    # Step 1: Generate a raw outline
    # this is basically incomprehensible, but our language server assisted us in writing
    # this and now we must never change argument order again.
    prompt_1 = prompt_generator.generate_scene_text_step_1(chapter_outline.improved,
                                                           str(scene_outline.scene_number),
                                                           scene_outline.setting,
                                                           scene_outline.primary_function,
                                                           scene_outline.secondary_function,
                                                           scene_outline.summary,
                                                           scene_outline.context,
                                                           scene.outline,
                                                           previous_scene.improved if previous_scene else None,
                                                           previous_chapter_outline=previous_chapter_outline.improved if previous_chapter_outline else None,
                                                           previous_text=previous_text if previous_text else None)

    query_result_1 = None
    splits = None
    try:
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, scene)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                print(splits)
                _test = formats.parse_scene_text(splits['scene'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_1 = query_executor(db_session, sys_prompt, prompt_1, story.author, scene)
        for chunk in query_result_stream_1:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_1 = chunk
                splits = formats.split_sections(query_result_1.complete_output)
                _test = formats.parse_scene_text(splits['scene'])
                break
    if query_result_1 is None or splits is None:
        print("Error source: ", query_result_1, splits)
        raise error.OrchestrationError("Orchestration failure at generate scene step 1")

    # Get the outline and yield it and save it.
    scene.raw = splits['scene']
    db_session.commit()
    db_session.refresh(scene)

    yield MidPoint(step=2, step_name="Editing Scene")

    prompt_2 = prompt_generator.generate_scene_text_step_2(chapter_outline.improved,
                                                           str(scene_outline.scene_number),
                                                           scene_outline.setting,
                                                           scene_outline.primary_function,
                                                           scene_outline.secondary_function,
                                                           scene_outline.summary,
                                                           scene_outline.context,
                                                           scene.outline,
                                                           scene.raw)


    query_result_2 = None
    splits = None
    try:
        query_result_stream_2 = query_executor(db_session, sys_prompt, prompt_2, story.author, scene)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                print(splits)
                _test = formats.parse_scene_text(splits['scene'])
                break
    except (KeyError, formats.ParsingError):
        print("ERROR PARSING, RETRYING")
        # attempt query one more time, then escalate to an API failure
        query_result_stream_2 = query_executor(db_session, sys_prompt, prompt_2, story.author, scene)
        for chunk in query_result_stream_2:
            if isinstance(chunk, str):
                yield chunk
            elif chunk is None:
                continue
            else:
                query_result_2 = chunk
                splits = formats.split_sections(query_result_2.complete_output)
                _test = formats.parse_scene_text(splits['scene'])
                break
    if query_result_2 is None or splits is None:
        print("Error source: ", query_result_2, splits)
        raise error.OrchestrationError("Orchestration failure at generate scene step 1")

    scene.edit_notes = splits['editing_notes']
    scene.improved = splits['scene']
    scene.final_text = scene.improved_text
    scene.modified = False
    db_session.commit()
    db_session.refresh(scene)

    #SQLAlchemy HATES this and we can just refresh from the frontend, still: TODO
    # yield SceneRead.from_orm(scene)
    yield scene
