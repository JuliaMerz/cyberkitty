
from collections.abc import Generator
from server.models import User, Story, StoryOutline, ChapterOutline, SceneOutline, Scene, Query, ApiCall
from server import formats
from server import prompt_generator
from server.database import db_session
from server.openai import query_executor


def generate_story(story: Story) -> Story:
    """
    Generate a new story, filling in the setting, main character, and summary fields of a model.

    As a consequence, also creates a stub story outline, that the user can then request to be filled in.
    """

    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes)
    story_prompt = prompt_generator.generate_story_base()

    query_result = query_executor(sys_prompt, story_prompt, story.author)

    try:
        d = formats.parse_story_base(query_result.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result = query_executor(sys_prompt, story_prompt, story.author)
        d = formats.parse_story_base(query_result.complete_output)

    story.tags = d['tags']
    story.setting = d['setting']
    story.main_characters = d['main_characters']
    story.summary = d['summary']

    outline = StoryOutline(story=story, author=story.author)

    db_session.add(story)

    db_session.commit()

    return story


def generate_story_outline(story_outline: StoryOutline) -> Generator[str | StoryOutline, None, None]:
    """
    Algorithm:

    For each step we generate the prompts, then send to api along with the messages from the previous step.

    """
    story = story_outline.story
    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes,
        setting=story.setting, main_characters=story.main_characters, summary=story.summary)

    # Step 1: Generate one-sentence outline
    prompt_1 = prompt_generator.generate_story_outline_step_1()

    try:
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)

    # Get the outline and yield it and save it.
    story_outline.outline_onesentence = splits['outline']
    yield story_outline.outline_onesentence
    db_session.commit()

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_story_outline_step_2()

    try:
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)

    story_outline.outline_mainevents_raw = splits['outline']
    yield story_outline.outline_mainevents_raw
    db_session.commit()

    # Step 3: Edit and improve the outline
    prompt_3 = prompt_generator.generate_story_outline_step_3()

    try:
        query_result_3 = query_executor(
            sys_prompt, prompt_3, story.author, query_result_2.all_messages)
        splits = formats.split_sections(query_result_3.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_3 = query_executor(
            sys_prompt, prompt_3, story.author, query_result_2.all_messages)
        splits = formats.split_sections(query_result_3.complete_output)

    story_outline.editing_notes = splits['editing_notes']
    story_outline.outline_mainevents_raw = splits['outline']
    yield story_outline.editing_notes + "\n\n" + story_outline.outline_mainevents_raw
    db_session.commit()

    # Step 4: Expand the outline with paragraph summary and notes
    prompt_4 = prompt_generator.generate_story_outline_step_4()

    try:
        query_result_4 = query_executor(
            sys_prompt, prompt_4, story.author, query_result_3.all_messages)
        splits = formats.split_sections(query_result_4.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_4 = query_executor(
            sys_prompt, prompt_4, story.author, query_result_3.all_messages)
        splits = formats.split_sections(query_result_4.complete_output)

    story_outline.outline_paragraphs = splits['outline']
    yield story_outline.outline_paragraphs
    db_session.commit()

    # Finally: Generate chapter stubs
    previous_chapter = None
    for chapter in story_outline.outline_paragraphs_parsed:
        chapter_outline = ChapterOutline(story_outline=story_outline,
                                         previous_chapter=previous_chapter,
                                         chapter_number=chapter['chapter_number'],
                                         title=chapter['title'],
                                         purpose=chapter['chapter_purpose'],
                                         main_events=chapter['main_events'],
                                         chapter_summary=chapter['chapter_summary'],
                                         notes=chapter['notes'])
        previous_chapter = chapter_outline
        db_session.add(chapter_outline)
    db_session.commit()

    # Yield the complete story_outline object
    yield story_outline


def generate_chapter_outline(chapter_outline: ChapterOutline) -> Generator[str | ChapterOutline, None, None]:

    story_outline = chapter_outline.story_outline
    story = story_outline.story
    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes,
        setting=story.setting, main_characters=story.main_characters, summary=story.summary, outline=story_outline.outline_paragraphs, fact_sheet=story_outline.fact_sheet, characters=story_outline.characters)

    # Step 1: Generate a raw outline
    prompt_1 = prompt_generator.generate_chapter_outline_step_1(
        str(chapter_outline.chapter_number), chapter_outline.title, chapter_outline.purpose, chapter_outline.paragraph_summary, chapter_outline.main_events, chapter_outline.chapter_notes)

    try:
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)

    # Get the outline and yield it and save it.
    chapter_outline.raw = splits['outline']
    yield chapter_outline.outline_onesentence
    db_session.commit()

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_chapter_outline_step_2(
        str(chapter_outline.chapter_number), chapter_outline.title, chapter_outline.purpose, chapter_outline.paragraph_summary, chapter_outline.main_events, chapter_outline.chapter_notes)

    try:
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)

    chapter_outline.edit_notes = splits['editing_notes']
    chapter_outline.improved = splits['outline']
    yield chapter_outline.improved
    db_session.commit()

    # Step 3: Generate scene stubs
    previous_scene = None
    for scene in chapter_outline.improved_parsed:
        scene_outline = SceneOutline(chapter_outline=chapter_outline,
                                     previous_scene=previous_scene,
                                     scene_number=scene['scene_number'],
                                     setting=scene['setting'],
                                     primary_function=scene['primary_function'],
                                     secondary_function=scene['secondary_function'],
                                     summary=scene['summary'],
                                     context=scene['context'])
        previous_scene = scene_outline
        db_session.add(scene_outline)


def generate_scene_outline(scene_outline: SceneOutline) -> Generator[str | SceneOutline, None, None]:

    chapter_outline = scene_outline.chapter_outline
    story_outline = chapter_outline.story_outline
    story = story_outline.story

    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes,
        setting=story.setting, main_characters=story.main_characters, summary=story.summary, outline=story_outline.outline_paragraphs, fact_sheet=story_outline.fact_sheet, characters=story_outline.characters)

    # Step 1: Generate a raw outline
    # this is basically incomprehensible, but our language server assisted us in writing
    # this and now we must never change argument order again.
    prompt_1 = prompt_generator.generate_scene_outline_step_1(chapter_outline.outline_paragraphs,
                                                              scene_outline.scene_number,
                                                              scene_outline.setting,
                                                              scene_outline.primary_function,
                                                              scene_outline.secondary_function,
                                                              scene_outline.summary,
                                                              scene_outline.context,
                                                              scene_outline.previous_scene.improved,
                                                              chapter_outline.previous_chapter.outline_paragraphs)

    try:
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)

    # Get the outline and yield it and save it.
    scene_outline.raw = splits['outline']
    yield scene_outline.raw
    db_session.commit()

    # Step 2: Generate main events outline
    prompt_2 = prompt_generator.generate_scene_outline_step_2(chapter_outline.outline_paragraphs,
                                                              str(scene_outline.scene_number),
                                                              scene_outline.setting,
                                                              scene_outline.primary_function,
                                                              scene_outline.secondary_function,
                                                              scene_outline.summary,
                                                              scene_outline.context)

    try:
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)

    scene_outline.edit_notes = splits['editing_notes']
    scene_outline.improved = splits['outline']
    yield scene_outline.improved
    db_session.commit()

    yield generate_scene_stub(story, scene_outline)


def generate_scene_stub(story, scene_outline):

    # Step 3: Generate scene stub

    scene = Scene(author=story.author,
                  scene_outline=scene_outline,
                  scene_number=scene_outline.scene_number,
                  previous_scene=scene_outline.previous_scene)
    db_session.add(scene)
    db_session.commit()

    return scene_outline


def generate_scene_text(scene: Scene) -> Generator[str | Scene, None, None]:

    scene_outline = scene.scene_outline
    chapter_outline = scene_outline.chapter_outline
    story_outline = chapter_outline.story_outline
    story = story_outline.story

    sys_prompt = prompt_generator.generate_system_instruction(
        story.description, story.style, story.themes,
        setting=story.setting, main_characters=story.main_characters, summary=story.summary, outline=story_outline.outline_paragraphs, fact_sheet=story_outline.fact_sheet, characters=story_outline.characters)

    previous_scene_outlines = chapter_outline.scene_outlines.order_by(
        scene_outline.scene_number.asc()).all()

    previous_text = "\n\n#\n\n".join(
        [scene_outline.scenes.first().improved_text for scene_outline in previous_scene_outlines])
    print(previous_text)

    # Step 1: Generate a raw outline
    # this is basically incomprehensible, but our language server assisted us in writing
    # this and now we must never change argument order again.
    prompt_1 = prompt_generator.generate_scene_text_step_1(chapter_outline.outline_paragraphs,
                                                           scene_outline.scene_number,
                                                           scene_outline.setting,
                                                           scene_outline.primary_function,
                                                           scene_outline.secondary_function,
                                                           scene_outline.summary,
                                                           scene_outline.context,
                                                           scene_outline.improved,
                                                           scene_outline.previous_scene.improved,
                                                           previous_chapter_outline=chapter_outline.previous_chapter.outline_paragraphs,
                                                           previous_text=previous_text)

    try:
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_1 = query_executor(sys_prompt, prompt_1, story.author)
        splits = formats.split_sections(query_result_1.complete_output)

    # Get the outline and yield it and save it.
    scene.raw = splits['text']
    yield scene.raw
    db_session.commit()

    yield scene

    prompt_2 = prompt_generator.generate_scene_text_step_2(chapter_outline.outline_paragraphs,
                                                           scene_outline.scene_number,
                                                           scene_outline.setting,
                                                           scene_outline.primary_function,
                                                           scene_outline.secondary_function,
                                                           scene_outline.summary,
                                                           scene_outline.context,
                                                           scene_outline.improved,
                                                           scene_outline.previous_scene.improved,
                                                           scene.raw)

    try:
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)
    except formats.ParsingError:
        # attempt query one more time, then escalate to an API failure
        query_result_2 = query_executor(
            sys_prompt, prompt_2, story.author, query_result_1.all_messages)
        splits = formats.split_sections(query_result_2.complete_output)

    scene.edit_notes = splits['editing_notes']
    scene.improved = splits['text']
    yield scene.improved
    db_session.commit()

    yield scene
