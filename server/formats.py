import re

def split_sections(string):
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
        '# Editing Notes',
        '# Outline',
        '# FactSheet',
        '# Characters',
    ]

    # Creating a regex pattern for the delimiters
    delimiter_pattern = '(' + '|'.join(re.escape(delimiter) for delimiter in section_delimiters) + ')'

    # Regex pattern to match sections
    pattern = fr"({delimiter_pattern})\n(.*?)(?=\n{delimiter_pattern}\n)|$)"

    # Finding all matches
    matches = re.findall(pattern, string, re.DOTALL)

    sections = {}
    for match in matches:
        delimiter, content = match[0], match[1]
        sections[delimiter] = content.strip()

    return sections


STORY_BASE_FORMAT = """\
    # Setting
    <the setting>

    # Main Characters
    <the main characters>

    # Summary
    <the summary>
    """

def parse_story_base(string):
    """
    Parse the story base format into a dictionary.
    """
    pattern = r"# Setting\n(.*?)\n\n# Main Characters\n(.*?)\n\n# Summary\n(.*?)\n"
    match = re.search(pattern, string, re.DOTALL)

    if match:
        return {
            'Setting': match.group(1).strip(),
            'Main Characters': match.group(2).strip(),
            'Summary': match.group(3).strip()
        }
    else:
        return {}



STORY_OUTLINE_FORMAT_STEP_1 = """\
    # Outline

    # Part 1/Arc 1 — <Title> (optional)
    ## Chapter 1 — <Title>
    <one sentence describing the chapter>
    ## Chapter 2 — <Title>
    <one sentence describing the chapter>
    ...
    """

def parse_story_outline_simple(string):
    """
    Parse the story outline format into a dictionary.
    """
    pattern = r"## Chapter (\d+) —\s*(.*?)\n(.*?)\n"
    matches = re.findall(pattern, string, re.DOTALL)

    chapters = [{'Chapter Number': chap_num, 'Title': title.strip(), 'Description': desc.strip()} for chap_num, title, desc in matches]
    return {'Chapters': chapters}


STORY_OUTLINE_FORMAT_STEP_2 = """\
    # Outline

    # Part 1/Arc 1 — <Title> (optional)
    ## Chapter 1 — <Title>
    ### Chapter Purpose
    <the function of this chapter in the story>
    ### Main Events
    <a list of the main events of this chapter>
    ### Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ## Chapter 2 — <Title>
    ### Chapter Purpose
    <the function of this chapter in the story>
    ### Main Events
    <a list of the main events of this chapter>
    ### Notes
    <the purpose of this chapter in the story, including theming, and any secondary functions like foreshadowing, character building, secondary character introductions, worldbuilding, chekovs guns, etc.>
    ...
    """

def parse_story_outline_complex(string):
    """
    Parse the story outline format into a dictionary.
    """
    chapter_pattern = r"## Chapter (\d+) —\s*(.*?)\n### Chapter Purpose\n(.*?)\n### Main Events\n(.*?)\n### Notes\n(.*?)\n"
    chapters = re.findall(chapter_pattern, string, re.DOTALL)

    outline = []
    for chap_num, title, purpose, events, notes in chapters:
        outline.append({
            'Chapter Number': chap_num,
            'Title': title.strip(),
            'Chapter Purpose': purpose.strip(),
            'Main Events': events.strip(),
            'Notes': notes.strip()
        })
    return {'Chapters': outline}



STORY_OUTLINE_FORMAT_STEP_3 = f"""\
    # Editing Notes
    <notes about what could be improved in the story>

    {STORY_OUTLINE_FORMAT_STEP_2}
    """


STORY_OUTLINE_FORMAT_STEP_4 = f"""\
    {STORY_OUTLINE_FORMAT_STEP_2}

    # FactSheet
    <list of important fact and context about the story, including how we keep the themes present>

    # Characters
    <list of all characters, including minor characters, and their roles in the story>
    """

def parse_chapter_outline(string):
    """
    Parse the chapter outline format into a dictionary.
    """
    scene_pattern = r"## Scene (\d+)\n### Setting\n(.*?)\n### Primary Function\n(.*?)\n### Secondary Function\n(.*?)\n### Summary\n(.*?)\n### Context\n(.*?)\n"
    scenes = re.findall(scene_pattern, string, re.DOTALL)

    chapter_outline = []
    for scene_num, setting, primary_func, secondary_func, summary, context in scenes:
        chapter_outline.append({
            'Scene Number': scene_num,
            'Setting': setting.strip(),
            'Primary Function': primary_func.strip(),
            'Secondary Function': secondary_func.strip(),
            'Summary': summary.strip(),
            'Context': context.strip()
        })
    return {'Scenes': chapter_outline}


CHAPTER_OUTLINE_FORMAT_STEP_1 = """\
    # Chapter <chapter_number> — <chapter_title>
    ## Scene 1
    ### Setting
    <the setting>
    ### Primary Function
    <the primary function>
    ### Secondary Function
    <the secondary function>
    ### Summary
    <the summary>
    ### Context
    <any context we need to write the scene>
    ## Scene 2
    ### Setting
    <the setting>
    ### Primary Function
    <the primary function>
    ### Secondary Function
    <the secondary function>
    ### Summary
    <the summary>
    ### Context
    <any context we need to write the scene>
    ...
    """

CHAPTER_OUTLINE_FORMAT_STEP_2 = f"""\
    # Editing Notes
    <notes about what could be improved in the chapter>

    {CHAPTER_OUTLINE_FORMAT_STEP_1}
    """

def parse_scene_outline(string):
    """
    Parse the scene outline format into a dictionary.
    """
    scene_pattern = r"# Scene (\d+)\n(.*?)\n"
    scenes = re.findall(scene_pattern, string, re.DOTALL)

    scene_outline = [{'Scene Number': scene_num, 'Content': content.strip()} for scene_num, content in scenes]
    return {'Scenes': scene_outline}


SCENE_OUTLINE_FORMAT_STEP_1 = """\
    # Scene <scene_number>
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

def parse_scene_text(string):
    """
    Parse the scene text format into a dictionary.
    """
    section_pattern = r"## (Paragraph|Dialogue) (.*?)\n(.*?)\n"
    sections = re.findall(section_pattern, string, re.DOTALL)

    scene_text = [{'Type': sec_type, 'Description': desc.strip(), 'Content': content.strip()} for sec_type, desc, content in sections]
    return {'Sections': scene_text}


SCENE_TEXT_FORMAT_STEP_1 = """\
    # Scene <scene_number>
    ## Paragraph <one sentence describing the paragraph from the outline>
    <the paragraph>
    ## Paragraph <one sentence describing the paragraph from the outline>
    <the paragraph>
    ## Dialogue <what is communicated and achieved in the dialogue, as well as any blocking, taken from the Dialogue Placeholder
    <the dialogue section>
    ...
    """

SCENE_TEXT_FORMAT_STEP_2 = f"""\
    # Editing Notes
    <notes about what could be improved in the scene>

    {SCENE_TEXT_FORMAT_STEP_1}
    """
