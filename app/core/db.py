from pathlib import Path
from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.models import Base


def create_database(url: str) -> tuple[Engine, sessionmaker]:
    parsed = make_url(url)

    if parsed.get_backend_name() != "sqlite":
        raise ValueError("Only SQLite is supported")

    if parsed.database and parsed.database != ":memory:":
        Path(parsed.database).expanduser().resolve().parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    engine = create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        connect_args={
            "check_same_thread": False,
            "timeout": 5,
        },
    )

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _record):
        cursor = connection.cursor()

        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
        finally:
            cursor.close()

    return engine, sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )


def initialize_database(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)


def get_session(request: Request) -> Generator[Session, None, None]:
    factory = request.app.state.session_factory

    with factory() as session:
        yield session
