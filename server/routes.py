from flask import Flask, Response, stream_with_context, request
from flask_restx import Api, Resource
from server.models import Story, StoryOutline, ChapterOutline, SceneOutline, Scene, Query, ApiCall
from server.database import db_session
from server import generator, transit_types
from server import app, api

import json
from functools import wraps
import time  # Used for simulating processing delays

app = Flask(__name__)


def sse_convert(string):
    """
    Convert a string to Server-Sent Events format.
    """
    return "\n".join(f"data: {line}" for line in string.split("\n")) + "\n\n"

    return f"data: {data}\n\n"


def generate_story_base(story_id):
    story = Story.objects.get(id=story_id)

    story = generator.generate_story(story)

    yield f"data: {story.to_transit_json()}\n\n"


def generate_story_outline(story_outline_id):
    story = StoryOutline.objects.get(id=story_outline_id)

    gen = generator.generate_story_outline(story)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.to_transit_json()}\n\n"
            # this should be the last item but we break anyway
            break


def generate_chapter_outline(chapter_id):
    chapter = ChapterOutline.objects.get(id=chapter_id)

    gen = generator.generate_chapter_outline(chapter)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.to_transit_json()}\n\n"
            # this should be the last item but we break anyway
            break


def generate_scene_outline(scene_id):
    scene = SceneOutline.objects.get(id=scene_id)

    gen = generator.generate_scene_outline(scene)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.to_transit_json()}\n\n"
            # this should be the last item but we break anyway
            break


def generate_scene_text(scene_id):
    scene = Scene.objects.get(id=scene_id)

    gen = generator.generate_scene_text(scene)

    for result in gen:
        if type(result) == str:
            yield sse_convert(result)
        else:
            yield f"data: {result.to_transit_json()}\n\n"
            # this should be the last item but we break anyway
            break


@api.route('/crud/story/<int:story_id>')
   def get(self, story_id):
        story = Story.objects.get(id=story_id)
        return story.to_transit_json()

    def put(self, story_id):
        story = Story.objects.get(id=story_id)
        story.update(**request.json)
        return story.to_transit_json()


@api.route('/generate/story_outline/<int:story_outline_id>')
class StoryOutlineResource(Resource):
    def get(self, story_outline_id):
        return Response(stream_with_context(generate_story_outline(story_outline_id)), content_type='text/event-stream')


@api.route('/generate/story_outline/<int:story_outline_id>')
class StoryOutlineResource(Resource):
    def get(self, story_outline_id):
        return Response(stream_with_context(generate_story_outline(story_outline_id)), content_type='text/event-stream')


@api.route('/generate/story_outline/<int:story_outline_id>')
class StoryOutlineResource(Resource):
    def get(self, story_outline_id):
        return Response(stream_with_context(generate_story_outline(story_outline_id)), content_type='text/event-stream')


@api.route('/generate/story_outline/<int:story_outline_id>')
class StoryOutlineResource(Resource):
    def get(self, story_outline_id):
        return Response(stream_with_context(generate_story_outline(story_outline_id)), content_type='text/event-stream')


"""
THIS SECTION FOR EXTREMELY STANDARD CRUD ROUTES
"""


def marshal_with_pydantic(model):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            response = f(*args, **kwargs)
            if isinstance(response, tuple):
                data, status_code = response
                return model.parse_obj(data).dict(), status_code
            else:
                return model.parse_obj(response).dict()
        return wrapper
    return decorator

class StoryResource(Resource):
    @marshal_with_pydantic(transit_types.GetStory)
    def get(self, id):
        story = Story.query.get(id)
        if not story:
            api.abort(404, "Story not found")
        return story

    @marshal_with_pydantic(transit_types.GetStory)
    def post(self):
        story_data = transit_types.CreateStory.parse_raw(request.data)
        story = Story(
            title=story_data['title'],
            author=story_data['author'],
            description=story_data['description'],
            style=data['style'],
            themes=data['themes'],
            # GPT generated fields initialized to None
            setting=None,
            main_characters=None,
            summary=None,
            tags=None
        )
        db_session.add(story)
        db_session.commit()
        return api.marshal(story, story_fields), 201

    @api.expect(story_fields)
    def put(self, id):
        story = Story.query.get(id)
        if not story:
            api.abort(404, "Story not found")
        data = api.payload
        story.title = data.get('title', story.title)
        # ... Update other fields similarly
        # Allow updating GPT generated fields as well
        story.setting = data.get('setting', story.setting)
        # ... Update other GPT generated fields similarly
        db_session.commit()
        return api.marshal(story, story_fields)

api.add_resource(StoryResource, '/stories/<int:id>')

class StoryOutlineResource(Resource):
    @api.marshal_with(story_outline_fields)
    def get(self, id):
        story_outline = StoryOutline.query.get(id)
        if not story_outline:
            api.abort(404, "StoryOutline not found")
        return story_outline

    @api.expect(story_outline_fields)
    def post(self):
        data = api.payload
        story_outline = StoryOutline(
            author=data['author'],
            story=data['story'],
            # Initialize GPT generated fields to None
            outline_onesentence=None,
            outline_mainevents_raw=None,
            editing_notes=None,
            outline_mainevents_improved=None,
            outline_paragraphs=None,
            fact_sheets=None,
            characters=None
        )
        db_session.add(story_outline)
        db_session.commit()
        return api.marshal(story_outline, story_outline_fields), 201

    @api.expect(story_outline_fields)
    def put(self, id):
        story_outline = StoryOutline.query.get(id)
        if not story_outline:
            api.abort(404, "StoryOutline not found")
        data = api.payload
        # Update fields
        story_outline.author = data.get('author', story_outline.author)
        story_outline.story = data.get('story', story_outline.story)
        # Allow updating GPT generated fields
        story_outline.outline_onesentence = data.get('outline_onesentence', story_outline.outline_onesentence)
        # ... Update other fields similarly
        db_session.commit()
        return api.marshal(story_outline, story_outline_fields)

api.add_resource(StoryOutlineResource, '/story-outlines/<int:id>')

class ChapterOutlineResource(Resource):
    @api.marshal_with(chapter_outline_fields)
    def get(self, id):
        chapter_outline = ChapterOutline.query.get(id)
        if not chapter_outline:
            api.abort(404, "ChapterOutline not found")
        return chapter_outline

    @api.expect(chapter_outline_fields)
    def post(self):
        data = api.payload
        chapter_outline = ChapterOutline(
            author=data['author'],
            story_outline=data['story_outline'],
            previous_chapter=data['previous_chapter'],
            chapter_number=data['chapter_number'],
            title=data['title'],
            purpose=data['purpose'],
            main_events=data['main_events'],
            paragraph_summary=data['paragraph_summary'],
            chapter_notes=data['chapter_notes'],
            # Initialize GPT generated fields to None
            raw=None,
            edit_notes=None,
            improved=None
        )
        db_session.add(chapter_outline)
        db_session.commit()
        return api.marshal(chapter_outline, chapter_outline_fields), 201

    @api.expect(chapter_outline_fields)
    def put(self, id):
        chapter_outline = ChapterOutline.query.get(id)
        if not chapter_outline:
            api.abort(404, "ChapterOutline not found")
        data = api.payload
        # Update fields
        chapter_outline.author = data.get('author', chapter_outline.author)
        # ... Update other fields similarly
        # Allow updating GPT generated fields
        chapter_outline.raw = data.get('raw', chapter_outline.raw)
        # ... Update other GPT generated fields similarly
        db_session.commit()
        return api.marshal(chapter_outline, chapter_outline_fields)

api.add_resource(ChapterOutlineResource, '/chapter-outlines/<int:id>')

class SceneOutlineResource(Resource):
    @api.marshal_with(scene_outline_fields)
    def get(self, id):
        scene_outline = SceneOutline.query.get(id)
        if not scene_outline:
            api.abort(404, "SceneOutline not found")
        return scene_outline

    @api.expect(scene_outline_fields)
    def post(self):
        data = api.payload
        scene_outline = SceneOutline(
            author=data['author'],
            chapter_outline=data['chapter_outline'],
            previous_scene=data['previous_scene'],
            scene_number=data['scene_number'],
            setting=data['setting'],
            primary_function=data['primary_function'],
            secondary_function=data['secondary_function'],
            summary=data['summary'],
            context=data['context'],
            # Initialize GPT generated fields to None
            raw=None,
            edit_notes=None,
            improved=None
        )
        db_session.add(scene_outline)
        db_session.commit()
        return api.marshal(scene_outline, scene_outline_fields), 201

    @api.expect(scene_outline_fields)
    def put(self, id):
        scene_outline = SceneOutline.query.get(id)
        if not scene_outline:
            api.abort(404, "SceneOutline not found")
        data = api.payload
        # Update fields
        scene_outline.author = data.get('author', scene_outline.author)
        # ... Update other fields similarly
        # Allow updating GPT generated fields
        scene_outline.raw = data.get('raw', scene_outline.raw)
        # ... Update other GPT generated fields similarly
        db_session.commit()
        return api.marshal(scene_outline, scene_outline_fields)

api.add_resource(SceneOutlineResource, '/scene-outlines/<int:id>')

class SceneResource(Resource):
    @api.marshal_with(scene_fields)
    def get(self, id):
        scene = Scene.query.get(id)
        if not scene:
            api.abort(404, "Scene not found")
        return scene

    @api.expect(scene_fields)
    def post(self):
        data = api.payload
        scene = Scene(
            author=data['author'],
            scene_outline=data['scene_outline'],
            scene_number=data['scene_number'],
            previous_scene=data['previous_scene'],
            # Initialize GPT generated fields to None
            raw=None,
            edit_notes=None,
            improved=None
        )
        db_session.add(scene)
        db_session.commit()
        return api.marshal(scene, scene_fields), 201

    @api.expect(scene_fields)
    def put(self, id):
        scene = Scene.query.get(id)
        if not scene:
            api.abort(404, "Scene not found")
        data = api.payload
        # Update fields
        scene.author = data.get('author', scene.author)

api.add_resource(SceneResource, '/scenes/<int:id>')

class QueryResource(Resource):
    @api.marshal_with(query_fields)
    def get(self, id):
        query = Query.query.get(id)
        if not query:
            api.abort(404, "Query not found")

        # Retrieve related ApiCalls
        api_calls = ApiCall.query.filter_by(query_id=query.id).all()
        query.api_calls = api_calls

        return query

api.add_resource(QueryResource, '/queries/<int:id>')



