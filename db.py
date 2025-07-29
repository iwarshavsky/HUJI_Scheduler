import os
import sqlite3
from flask import current_app as app
from flask import g
import psycopg2

DATABASE = 'db.sqlite'


# def init_db():
#     with app.app_context():
#         db = get_db()
#         with app.open_resource('schema.sql', mode='r') as f:
#             db.cursor().execute(f.read())
#         db.commit()


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        # os.environ["DATABASE_URL"]
        db = g._database = psycopg2.connect("postgresql://localhost/postgres?user=postgres&password=Ih8HUJI")
        # db = g._database = psycopg2.connect(os.environ["DATABASE_URL"])
        """
        database=os.environ["PGDATABASE"],
                                            host=os.environ["PGHOST"],
                                            user=os.environ["PGUSER"],
                                            password=os.environ["PGPASSWORD"],
                                            port=os.environ["PGPORT"]
        """
    # db.row_factory = sqlite3.Row
    return db


# def clean_db(func):
#     def wrapper(*args, **kwargs):
#         files_to_delete = func(
#             "SELECT filename FROM sessions WHERE datetime(last_accessed) < datetime('now', '-10 minutes')")
#         for file_to_delete in files_to_delete:
#             try:
#                 os.remove(file_to_delete)
#                 print(f"File '{file_to_delete}' deleted successfully.")
#             except FileNotFoundError:
#                 print(f"Error: File '{file_to_delete}' not found.")
#             except Exception as e:
#                 print(f"An error occurred: {e}")
#         func(*args, **kwargs)
#
#     return wrapper


# @clean_db
def query_db(query, args=(), one=False):
    q = query.lower()
    db = get_db()
    cur = db.cursor()
    cur.execute(query, args)
    rv = None
    if "select" in q:
        rv = cur.fetchall()
    cur.close()
    if "insert" in q or "UPDATE" in q or "DELETE" in q:
        db.commit()
    if "select" in q:
        return (rv[0] if rv else None) if one else rv
    return None

def close_db():
    db = getattr(g, '_database', None)
    if db is not None:
        db.commit()
        db.close()


