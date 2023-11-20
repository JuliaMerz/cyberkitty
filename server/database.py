from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import get_settings


conf = get_settings()
engine = None
url = f"{conf.DB_DRIVER}://{conf.DB_USER}:{conf.DB_PASS}@{conf.DB_HOST}/{conf.DB_NAME}"

if conf.DB_DRIVER=="sqlite":
    engine = create_engine(
        url, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        url, connect_args={}
    )


def get_db_session():
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


