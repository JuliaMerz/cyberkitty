from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import get_settings


conf = get_settings()

engine = create_engine(
    conf.DATABASE_URL, connect_args={"check_same_thread": False}
)


def get_db_session():
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


