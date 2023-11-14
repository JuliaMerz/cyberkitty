from sqlmodel import SQLModel, Field, Relationship


class BaseSQLModel(SQLModel):
    is_public = False
