from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def database(url: str):
    engine = create_engine(url, pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})
    return engine, sessionmaker(engine, expire_on_commit=False)
