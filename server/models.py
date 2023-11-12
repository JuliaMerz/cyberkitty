import sqlalchemy as db

from server.database import Base
from server import formats


class User(Base):
    """
    If we want to publicly host this, we need a user model.

    V0 will be single user, so all author keys must be None.
    """
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True)
    email = db.Column(db.String(120), unique=True)

    tokens = db.Column(db.Float, default=0.)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())


    def __init__(self, name=None, email=None):
        self.name = name
        self.email = email

    def __repr__(self):
        return '<User %r>' % (self.name)


class Story(Base):
    __tablename__ = 'stories'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(50))
    author = db.ForeignKey(User, nullable=True)

    description = db.Column(db.Text)
    style = db.Column(db.Text)
    persona = db.Column(db.Text)

    # GPT GENERATED
    setting = db.Column(db.Text, nullable=True, default=None)
    main_characters = db.Column(db.Text, nullable=True, default=None)
    summary = db.Column(db.Text, nullable=True, default=None)

    modified = db.Column(db.Boolean, default=False)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())

    def __repr__(self):
        return '<Story %r — by %r>' % (self.title, self.author)


"""
Story Outline uses a four step, three output strategy:
one sentence — one sentence per chapter of the story.

main events — a list of main events per chapter of the story.

(final)
paragraphs — each chapter gets one paragraph describing the chapter.
chapter-notes — a list of notes per chapter of the story for things like themeing, foreshadowing, secondary functions

AFTER we generate a fact sheet and a theme sheet and a character sheet, which later
GPT iterations will use to keep the context of the story more consistent.
"""
class StoryOutline(Base):
    __tablename__ = 'story_outlines'
    id = db.Column(db.Integer, primary_key=True)
    author = db.ForeignKey(User, nullable=True)
    story = db.ForeignKey(Story)

    # GPT GENERATED
    outline_onesentence = db.Column(db.Text, nullable=True, default=None)
    outline_mainevents = db.Column(db.Text, nullable=True, default=None)
    editing_notes = db.Column(db.Text, nullable=True, default=None)
    outline_paragraphs = db.Column(db.Text, nullable=True, default=None)
    fact_sheets = db.Column(db.Text, nullable=True, default=None)
    characters = db.Column(db.Text, nullable=True, default=None)

    modified = db.Column(db.Boolean, default=False)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())



"""
For each scene we request
Outline - Events in the scene.
Primary Function - What are we trying to achieve with this scene?
Secondary Function - Themes, foreshadowing, character development, secondary character introductions, chekov's guns, etc. NOT TOO MANY

When requesting the outline we ask it twice, once initial generation, and once to edit and improve it.
"""
class ChapterOutline(Base):
    __tablename__ = 'chapter_outlines'

    id = db.Column(db.Integer, primary_key=True)
    author = db.ForeignKey(User, nullable=True)
    story_outline = db.ForeignKey(StoryOutline)
    chapter_number = db.Column(db.Integer)
    title = db.Column(db.String(150)) # pulled from story outline
    purpose = db.Column(db.Text) # pulled from story outline
    main_events = db.Column(db.Text) # pulled from story outline
    paragraph_summary = db.Column(db.Text) # pulled from story outline
    chapter_notes = db.Column(db.Text) # pulled from story outline

    # GPT GENERATED
    # setting = db.Column(db.Text, nullable=True, default=None)
    raw = db.Column(db.Text, nullable=True, default=None) # Structure:  for each scene, events, primary function, secondary function
    edit_notes = db.Column(db.Text, nullable=True, default=None)
    improved = db.Column(db.Text, nullable=True, default=None)

    @property
    def raw_parsed(self): #this should return a list of scene outlines. unsaved.
        return formats.parse_chapter_outline(self.raw)

    @property
    def improved_parsed(self): #this should return a list of scene outlines. unsaved.
        return formats.parse_chapter_outline(self.improved)

    modified = db.Column(db.Boolean, default=False)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())

"""
Scene outlines exist because GPT is attrocius at writing
text longer than 300 words. We can't have each scene be 300 words,
so we need to break it down further.

We need to be a bit experimental here in how we define scenes.

Initial: one sentence per paragraph, dialog notes, blocking notes
Edits: Make sure dialog and blocking are intertwined well, make notes of when to add descriptions of things

"""
class SceneOutline(Base):
    __tablename__ = 'scene_outlines'

    id = db.Column(db.Integer, primary_key=True)
    author = db.ForeignKey(User, nullable=True)
    chapter_outline = db.ForeignKey(ChapterOutline)
    scene_number = db.Column(db.Integer)
    previous_scene = db.Column(db.ForeignKey('scene_outlines.id'), nullable=True)
    setting = db.Column(db.Text) # pulled from chapter outline
    primary_function = db.Column(db.Text) # pulled from chapter outline
    secondary_function = db.Column(db.Text) # pulled from chapter outline
    outline = db.Column(db.Text) # pulled from chapter outline

    # GPT GENERATED
    raw = db.Column(db.Text, nullable=True, default=None)
    edit_notes = db.Column(db.Text, nullable=True, default=None)
    improved = db.Column(db.Text, nullable=True, default=None)

    @property
    def raw_parsed(self):
        return formats.parse_scene_outline(self.raw)

    @property
    def improved_parsed(self):
        return formats.parse_scene_outline(self.improved)


    modified = db.Column(db.Boolean, default=False)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())


class Scene(Base):
    __tablename__ = 'scenes'

    id = db.Column(db.Integer, primary_key=True)
    author = db.ForeignKey(User, nullable=True)
    scene_outline = db.ForeignKey(ChapterOutline)
    scene_number = db.Column(db.Integer)
    previous_scene = db.Column(db.ForeignKey('scenes.id'), nullable=True)

    # GPT GENERATED
    raw = db.Column(db.Text, nullable=True, default=None)
    edit_notes = db.Column(db.Text, nullable=True, default=None)
    improved = db.Column(db.Text, nullable=True, default=None)

    @property
    def raw_parsed(self):
        return formats.parse_scene_outline(self.raw)

    @property
    def improved_parsed(self):
        return formats.parse_scene_outline(self.improved)

    @property
    def raw_text(self):
        d =  formats.parse_scene_text(self.raw_parsed)
        out = []
        for section in d['content']:
            out.append(section['text'])
        return '\n\n'.join(out)

    @property
    def improved_text(self):
        d =  formats.parse_scene_text(self.raw_parsed)
        out = []
        for section in d['content']:
            out.append(section['text'])
        return '\n\n'.join(out)



    modified = db.Column(db.Boolean, default=False)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())




"""
A query is a thin wrapper, including retries for a certain set of errors and continues for length.
"""
class Query(Base):
    __tablename__ = 'queries'
    id = db.Column(db.Integer, primary_key=True)
    author = db.ForeignKey(User, nullable=True)

    continues = db.Column(db.Integer)
    retries = db.Column(db.Integer)

    total_cost = db.Column(db.Float)

    original_prompt = db.Column(db.Text)
    previous_messages = db.Column(db.JSON)
    all_messages = db.Column(db.JSON)
    complete_output = db.Column(db.Text)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())

"""
API Calls are the actual API calls made to the openai api.
"""
class ApiCall(Base):
    __tablename__ = 'api_calls'
    timestamp = db.Column(db.DateTime)

    query = db.ForeignKey(Query)

    success = db.Column(db.Boolean)
    error = db.Column(db.Text, nullable=True, server_default=None)

    cost = db.Column(db.Float, nullable=True) #null for when the openai doesn't return usage numbers

    input_messages = db.Column(db.JSON)
    output = db.Column(db.Text)

    created_on = db.Column(db.DateTime, server_default=db.func.now())
    updated_on = db.Column(db.DateTime, server_default=db.func.now(), server_onupdate=db.func.now())




"""
Set up many to many relationships coordinating data items with associated queries.
"""
story_query = db.Table('story_query',
             Base.metadata,
    db.Column('story_id', db.Integer, db.ForeignKey('story.id'), primary_key=True),
    db.Column('query_id', db.Integer, db.ForeignKey('query.id'), primary_key=True)
)

story_outline_query = db.Table('story_outline_query',
             Base.metadata,
    db.Column('story_outline_id', db.Integer, db.ForeignKey('story_outline.id'), primary_key=True),
    db.Column('query_id', db.Integer, db.ForeignKey('query.id'), primary_key=True)
)

chapter_outline_query = db.Table('chapter_outline_query',
             Base.metadata,
    db.Column('chapter_outline_id', db.Integer, db.ForeignKey('chapter_outline.id'), primary_key=True),
    db.Column('query_id', db.Integer, db.ForeignKey('query.id'), primary_key=True)
)

scene_outline_query = db.Table('scene_outline_query',
             Base.metadata,
    db.Column('scene_outline_id', db.Integer, db.ForeignKey('scene_outline.id'), primary_key=True),
    db.Column('query_id', db.Integer, db.ForeignKey('query.id'), primary_key=True)
)

scene_query = db.Table('scene_query',
             Base.metadata,
    db.Column('scene_id', db.Integer, db.ForeignKey('scene.id'), primary_key=True),
    db.Column('query_id', db.Integer, db.ForeignKey('query.id'), primary_key=True)
)

