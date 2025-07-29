CREATE TABLE IF NOT EXISTS "course_cache" (
	"course_num"	INTEGER,
	"year"	INTEGER,
	"semester"	INTEGER,
	"data"	TEXT,
	"date_created"	TIMESTAMPTZ,
	PRIMARY KEY("course_num","year","semester")
);

CREATE TABLE IF NOT EXISTS "stats" (
    "uuid" TEXT,
    "timestamp" TIMESTAMPTZ,
    "action" TEXT,
    "result" JSON,
	"config"	JSON,
    "ip_address" TEXT
);