



```
pydantic2ts --module server/main.py --output frontend/src/apiTypes.ts --json2ts-cmd "yarn json2ts" --exclude ApiCallBase --exclude QueryBase --exclude StoryBase --exclude StoryOutlineBase --exclude ChapterOutlineBase --exclude SceneOutlineBase --exclude SceneBase --exclude BaseSettings --exclude Settings --exclude BaseSQLModel --exclude SQLModel
```
