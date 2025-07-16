DROP TABLE IF EXISTS sessions;

CREATE TABLE sessions (
  uuid TEXT PRIMARY KEY,
  num_objects INTEGER NOT NULL,
  filename TEXT UNIQUE NOT NULL,
  last_accessed INTEGER NOT NULL
);