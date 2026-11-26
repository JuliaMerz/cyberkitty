import re
from typing import TypedDict
from .error import ParsingError


# Everything except story base MUST be split before it is parsed.
def split_sections(string) -> dict:
    """
    Split the story outline into various sections based on predefined section delimiters.

    Thanks chatgpt.

    Args:
        string (str): The input text containing various sections.

    Returns:
        dict: Dictionary with each section and its content.
    """
    # List of permissible section delimiters
    section_delimiters = [
        r'# Editing Notes',
        r'# (?:\w+ )?Outline',
        r'# Fact(?: )?Sheet',
        r'# (?:\w+ )?Characters',
        r'# Scene',
    ]

    # Creating a regex pattern for the delimiters
    delimiter_pattern = '(' + '|'.join(delimiter
                                       for delimiter in section_delimiters) + ')'
    print("DELIMETER REGEX: ", delimiter_pattern)

    # Regex pattern to match sections
    pattern = fr"{delimiter_pattern}\w*\n(.*?)(?=(\n{delimiter_pattern}\n|$))"

    # Finding all matches
    matches = re.findall(pattern, string, re.DOTALL)

    sections = {}
    for match in matches:
        delimiter, content = match[0], match[1]
        sections[delimiter[2:].replace(" ", "_").lower()] = content.strip()


    return sections


STORY_BASE_FORMAT = """\
    # Setting
    <the setting>

    # Main Characters
    <the main characters>

    # Summary
    <the summary>

    # Tags
    <comma separated list of tags describing the book>
    """


class StoryBaseParsed(TypedDict):
    setting: str
    main_characters: str
    summary: str
    tags: list[str]


def parse_story_base(string) -> StoryBaseParsed:
    """
    Parse the story base format into a dictionary.
    """
    pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n\n# Tags\n(.*?)(?=\n|$)"
    match = re.search(pattern, string, re.DOTALL)

    if match:
        return {
            'setting': match.group(1).strip(),
            'main_characters': match.group(2).strip(),
            'summary': match.group(3).strip(),
            'tags': [tag.strip() for tag in match.group(4).strip().split(',')]
        }
    else:
        raise ParsingError('Could not parse story base.')


STORY_OUTLINE_FORMAT_STEP_1 = """\
    # Outline

    ## Part 1/Arc 1 — <Title> (optional)
    ### Chapter 1 — <Title>
    <one sentence describing the chapter>
    ### Chapter 2 — <Title>
    <one sentence describing the chapter>
    ...
    """


class SimpleOutlineInnerParsed(TypedDict):
    chapter_number: str
    title: str
    description: str


class SimpleOutlineParsed(TypedDict):
    chapters: list[SimpleOutlineInnerParsed]


def parse_story_outline_simple(string) -> SimpleOutlineParsed:
    """
    Parse the story outline format into a dictionary.
    """
    pattern = r"### Chapter (\d+) —\s*(.*?)\n(.*?)(?=\n|$)"
    matches = re.findall(pattern, string, re.DOTALL)

    chapters: list[SimpleOutlineInnerParsed] = [{
                    'chapter_number': chap_num,
                    'title': title.strip(),
                    'description': desc.strip()
                } for chap_num, title, desc in matches]
    if len(chapters) == 0:
        raise ParsingError('Could not parse story outline.')
    return {'chapters': chapters}


STORY_OUTLINE_FORMAT_STEP_2 = """\
    # Outline

    ## Part 1/Arc 1 — <Title> (optional)
    ### Chapter 1 — <Title>
    #### Chapter Purpose
    <the function of this chapter in the story>
    #### Main Events
    <a list of the main events of this chapter>
    #### Chapter Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ### Chapter 2 — <Title>
    #### Chapter Purpose
    <the function of this chapter in the story>
    #### Main Events
    <a list of the main events of this chapter>
    #### Chapter Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ...
    """


class MediumOutlineInnerParsed(TypedDict):
    part_label: str | None
    chapter_number: str
    title: str
    chapter_purpose: str
    main_events: str
    notes: str


class MediumOutlineParsed(TypedDict):
    chapters: list[MediumOutlineInnerParsed]


def parse_story_outline_medium(string) -> MediumOutlineParsed:
    """
    Parse the story outline format into a dictionary.
    """
    chapter_pattern = r"""
        (?:\#\#\s(?P<part_label>Part\s.*?)\n)?
        (?:.*?) #this compensates for editing notes or other garbage. Min so it doens't eat content.
        \#\#\#\sChapter\s(?P<chap_num>\d+)
        (?:\s*—\s*(?P<title>.*?))?
        \n
        (?:\#\#\#\#\sChapter\sPurpose\n(?P<purpose>.*?))?
        \n
        (?:\#\#\#\#\sMain\sEvents\n(?P<events>.*?))?
        \n
        (?:\#\#\#\#\s(?:Chapter\s)?Notes\n(?P<notes>.*?))?
        (?=\n\#\#\#\sChapter|\Z)
    """
    chapters = re.finditer(chapter_pattern, string, re.DOTALL | re.VERBOSE)

    outline: list[MediumOutlineInnerParsed] = []
    for match in chapters:
        outline.append({
            'part_label': match.group('part_label').strip() if match.group('part_label') else None,
            'chapter_number': match.group('chap_num').strip(),
            'title': match.group('title').strip() if match.group('title') else '',
            'chapter_purpose': match.group('purpose').strip() if match.group('purpose') else '',
            'main_events': match.group('events').strip() if match.group('events') else '',
            'notes': match.group('notes').strip() if match.group('notes') else ''
        })
    return {'chapters': outline}


STORY_OUTLINE_FORMAT_STEP_3 = f"""\
    # Editing Notes
    <notes about what could be improved in the story>

    {STORY_OUTLINE_FORMAT_STEP_2}
    """

STORY_OUTLINE_FORMAT_STEP_4 = f"""\
    # Outline

    ## Part 1/Arc 1 — <Title> (optional)
    ### Chapter 1 — <Title>
    #### Chapter Purpose
    <the function of this chapter in the story>
    #### Main Events
    <a list of the main events of this chapter>
    #### Chapter Summary
    <a paragraph summarizing the chapter>
    #### Chapter Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ### Chapter 2 — <Title>
    #### Chapter Purpose
    <the function of this chapter in the story>
    #### Main Events
    <a list of the main events of this chapter>
    #### Chapter Summary
    <a paragraph summarizing the chapter>
    #### Chapter Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ...

    # FactSheet
    <list of important fact and context about the story, including how we keep the themes present>

    # Characters
    <list of all characters, including minor characters, and their roles in the story>
    """


class ComplexOutlineInnerParsed(TypedDict):
    part_label: str | None
    chapter_number: str
    title: str
    chapter_purpose: str
    chapter_summary: str
    main_events: str
    notes: str


class ComplexOutlineParsed(TypedDict):
    chapters: list[ComplexOutlineInnerParsed]

def parse_story_outline_complex(string) -> ComplexOutlineParsed:
    """
    Parse the story outline format into a dictionary.
    """
    chapter_pattern = r"""
        (?:\#\#\s(?P<part_label>(Part|Arc)\s.*?)\n)?
        (?:.*?) #this compensates for editing notes or other garbage. Min so it doens't eat content.
        \#\#\#\sChapter\s(?P<chap_num>\d+)
        (?:\s*—\s*(?P<title>.*?)\n)?
        (?P<content>.*?)
        (?=\n\#\#\#\sChapter|\Z)
    """

    inner_pattern = r"""
        (?:\#\#\#\#\sChapter\sPurpose\n(?P<purpose>.*?)\n)?
        (?:\#\#\#\#\sMain\sEvents\n(?P<events>.*?)\n)?
        (?:\#\#\#\#\sChapter\sSummary\n(?P<summary>.*?)\n)?
        (?:\#\#\#\#\s(?:Chapter\s)?Notes\n(?P<notes>.*?))?
    """
    chapters = re.finditer(chapter_pattern, string, re.DOTALL | re.VERBOSE)

    outline: list[ComplexOutlineInnerParsed] = []
    for match in chapters:
        inner_match = re.search(inner_pattern, match.group('content'), re.DOTALL | re.VERBOSE)
        if not inner_match:
            print("FAILURE OF INNER")
            print("INNER MATCH: ", match.group('content'))
            continue
        outline.append({
            'part_label': match.group('part_label').strip() if match.group('part_label') else None,
            'chapter_number': match.group('chap_num').strip(),
            'title': match.group('title').strip() if match.group('title') else '',
            'chapter_purpose': inner_match.group('purpose').strip() if inner_match.group('purpose') else '',
            'chapter_summary': inner_match.group('summary').strip() if inner_match.group('summary') else '',
            'main_events': inner_match.group('events').strip() if inner_match.group('events') else '',
            'notes': inner_match.group('notes').strip() if inner_match.group('notes') else ''
        })
    return {'chapters': outline}



# def parse_story_outline_complex(string) -> ComplexOutlineParsed:
#     """
#     Parse the story outline format into a dictionary.
#     """
#     chapter_pattern = r"### Chapter (\d+) —\s*(.*?)\n#### Chapter Purpose\n(.*?)\n#### Main Events\n(.*?)\n#### Chapter Summary\n(.*?)\n#### Chapter Notes\n(.*?)(?=\n|$)"
#     chapters = re.findall(chapter_pattern, string, re.DOTALL)

#     outline: list[ComplexOutlineInnerParsed] = []
#     for chap_num, title, purpose, events, summary, notes in chapters:
#         outline.append({
#             'chapter_number': chap_num,
#             'title': title.strip(),
#             'chapter_purpose': purpose.strip(),
#             'chapter_summary': summary.strip(),
#             'main_events': events.strip(),
#             'notes': notes.strip()
#         })
#     return {'chapters': outline}


class ChapterOutlineInnerParsed(TypedDict):
    scene_number: str
    setting: str
    primary_function: str
    secondary_function: str
    summary: str
    context: str


class ChapterOutlineParsed(TypedDict):
    scenes: list[ChapterOutlineInnerParsed]

def parse_chapter_outline(string) -> ChapterOutlineParsed:
    """
    Parse the chapter outline format into a dictionary.
    """
    scene_pattern = r"""
        \#\#\#\sScene\s(?P<scene_num>\d+)
        \n
        (?:\#\#\#\#\sSetting\n(?P<setting>.*?))?
        \n
        (?:\#\#\#\#\sPrimary\sFunction\n(?P<primary_func>.*?))?
        \n
        (?:\#\#\#\#\sSecondary\sFunction\n(?P<secondary_func>.*?))?
        \n
        (?:\#\#\#\#\sSummary\n(?P<summary>.*?))?
        \n
        (?:\#\#\#\#\sContext\n(?P<context>.*?))?
        (?=\n\#\#\#\sScene|\Z)
    """
    scenes = re.finditer(scene_pattern, string, re.DOTALL | re.VERBOSE)

    chapter_outline: list[ChapterOutlineInnerParsed] = []
    for match in scenes:
        chapter_outline.append({
            'scene_number': match.group('scene_num').strip(),
            'setting': match.group('setting').strip() if match.group('setting') else '',
            'primary_function': match.group('primary_func').strip() if match.group('primary_func') else '',
            'secondary_function': match.group('secondary_func').strip() if match.group('secondary_func') else '',
            'summary': match.group('summary').strip() if match.group('summary') else '',
            'context': match.group('context').strip() if match.group('context') else ''
        })
    return {'scenes': chapter_outline}


# def parse_chapter_outline(string) -> ChapterOutlineParsed:
#     """
#     Parse the chapter outline format into a dictionary.
#     """
#     scene_pattern = r"### Scene (\d+)\n#### Setting\n(.*?)\n#### Primary Function\n(.*?)\n#### Secondary Function\n(.*?)\n#### Summary\n(.*?)\n#### Context\n(.*?)(?=\n|$)"
#     scenes = re.findall(scene_pattern, string, re.DOTALL)

#     chapter_outline: list[ChapterOutlineInnerParsed] = []
#     for scene_num, setting, primary_func, secondary_func, summary, context in scenes:
#         chapter_outline.append({
#             'scene_number': scene_num,
#             'setting': setting.strip(),
#             'primary_function': primary_func.strip(),
#             'secondary_function': secondary_func.strip(),
#             'summary': summary.strip(),
#             'context': context.strip()
#         })
#     return {'scenes': chapter_outline}


CHAPTER_OUTLINE_FORMAT_STEP_1 = """\
    # Outline
    ## Chapter <chapter_number> — <chapter_title>
    ### Scene 1
    #### Setting
    <the setting>
    #### Primary Function
    <the primary function>
    #### Secondary Function
    <the secondary function>
    #### Summary
    <the summary>
    #### Context
    <any context we need to write the scene>
    ### Scene 2
    #### Setting
    <the setting>
    #### Primary Function
    <the primary function>
    #### Secondary Function
    <the secondary function>
    #### Summary
    <the summary>
    #### Context
    <any context we need to write the scene>
    ...
    """

CHAPTER_OUTLINE_FORMAT_STEP_2 = f"""\
    # Editing Notes
    <notes about what could be improved in the chapter>

    {CHAPTER_OUTLINE_FORMAT_STEP_1}
    """


class SceneOutlineInnerParsed(TypedDict):
    scene_number: str
    content: str


class SceneOutlineParsed(TypedDict):
    scenes: list[SceneOutlineInnerParsed]


def parse_scene_outline(string) -> SceneOutlineParsed:
    """
    Parse the scene outline format into a dictionary.
    """
    scene_pattern = r"## Scene:? (\d+)\n(.*?)(?=\n|$)"
    scenes = re.findall(scene_pattern, string, re.DOTALL)

    scene_outline: list[SceneOutlineInnerParsed] = [{'scene_number': scene_num, 'content': content.strip()}
                                                    for scene_num, content in scenes]
    return {'scenes': scene_outline}


SCENE_OUTLINE_FORMAT_STEP_1 = """\
    # Outline
    ## Scene <scene_number>
    - Paragraph: <one sentence describing the paragraph>
    - Paragraph: <one sentence describing the paragraph>
    - Dialogue Placeholder: <what is communicated and achieved in the dialogue, as well as any blocking>
    ...
    """

SCENE_OUTLINE_FORMAT_STEP_2 = f"""\
    # Editing Notes
    <notes about what could be improved in the scene>

    {SCENE_OUTLINE_FORMAT_STEP_1}
    """


class SceneTextInnerParsed(TypedDict):
    type: str
    description: str
    content: str


class SceneTextParsed(TypedDict):
    sections: list[SceneTextInnerParsed]


def parse_scene_text(string) -> SceneTextParsed:
    """
    Parse the scene text format into a dictionary.
    """
    section_pattern = r"### (Paragraph|Dialogue):? (.*?)\n(.*?)(?=\n|$)"
    sections = re.findall(section_pattern, string, re.DOTALL)

    scene_text: list[SceneTextInnerParsed] = [{'type': sec_type, 'description': desc.strip(
    ), 'content': content.strip()} for sec_type, desc, content in sections]
    return {'sections': scene_text}


SCENE_TEXT_FORMAT_STEP_1 = """\
    # Scene
    ## Scene <scene_number>
    ### Paragraph <one sentence describing the paragraph from the outline>
    <the paragraph>
    ### Paragraph <one sentence describing the paragraph from the outline>
    <the paragraph>
    ### Dialogue <what is communicated and achieved in the dialogue, as well as any blocking, taken from the Dialogue Placeholder
    <the dialogue section>
    ...
    """

SCENE_TEXT_FORMAT_STEP_2 = f"""\
    # Editing Notes
    <notes about what could be improved in the scene>

    {SCENE_TEXT_FORMAT_STEP_1}
    """
