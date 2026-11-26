from fastapi import Depends, HTTPException, status
from typing import Type, Annotated
from sqlmodel import Session
from .models import User, Story, Scene, SceneOutline, ChapterOutline, StoryOutline, Query, ApiCall
from .auth_config import get_current_user, get_current_user_or_none
from .database import engine, get_db_session

AuthorTypes = Story | Scene | SceneOutline | ChapterOutline | StoryOutline | Query
QueryableTypes = AuthorTypes | User


class GetDbObject():
    # "will mutate" is a declaration of intention. we can't enforce mutability in
    # typing, so awkward variable name forces us to think about it.
    def __init__(self, will_mutate: bool, model: Type[QueryableTypes]):
        self.model = model
        self.will_mutate = will_mutate

    def __call__(self,
                 obj_id: int,
                 session: Annotated[Session, Depends(get_db_session)],
                 current_user: Annotated[User|None, Depends(get_current_user_or_none)]):

        print("Attempting fetch", self.model, obj_id)
        obj = session.get(self.model, obj_id)

        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                                detail="Resource not found")

        # it it's public and we don't intend to mutate it, we can return it
        if (not self.will_mutate) and obj.is_public:
            return obj

        # not public or we mutate so check authorship or mutable
        # print('current_user', current_user, obj)
        # ignoring type because we check for the None case and python shortcircuits
        if current_user == None or (self.model != User and current_user.id != obj.author_id): #type: ignore
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="Not authorized to access this resource")

        return obj



