# init

from .openai import *
from .gen import *
from .web import *

Query.update_forward_refs()
ApiCall.update_forward_refs()
ApiCallRead.update_forward_refs()
QueryRead.update_forward_refs()

Story.update_forward_refs()
StoryOutline.update_forward_refs()
ChapterOutline.update_forward_refs()
SceneOutline.update_forward_refs()
Scene.update_forward_refs()

StoryRead.update_forward_refs(Query=Query, ChapterOutlineRead=ChapterOutlineRead, SceneOutlineRead=SceneOutlineRead, SceneRead=SceneRead)
StoryReadRecursive.update_forward_refs()
StoryReadQueries.update_forward_refs(QueryRead=QueryRead)
StoryOutlineRead.update_forward_refs(QueryRead=QueryRead)
StoryOutlineReadRecursive.update_forward_refs()
StoryOutlineReadQueries.update_forward_refs(QueryRead=QueryRead)
ChapterOutlineRead.update_forward_refs()
ChapterOutlineReadRecursive.update_forward_refs()
ChapterOutlineReadQueries.update_forward_refs(QueryRead=QueryRead)
SceneOutlineRead.update_forward_refs()
SceneOutlineReadRecursive.update_forward_refs()
SceneOutlineReadQueries.update_forward_refs(QueryRead=QueryRead)
SceneRead.update_forward_refs()
SceneReadQueries.update_forward_refs(QueryRead=QueryRead)

