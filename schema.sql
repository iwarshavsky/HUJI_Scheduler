CREATE TABLE IF NOT EXISTS "course_cache" (
	"course_num"	INTEGER,
	"year"	INTEGER,
	"semester"	INTEGER,
	"data"	BLOB,
	"date_created"	INTEGER,
	PRIMARY KEY("course_num","year","semester")
)
