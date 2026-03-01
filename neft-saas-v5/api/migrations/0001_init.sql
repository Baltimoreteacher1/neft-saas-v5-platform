-- 0001_init.sql
CREATE TABLE IF NOT EXISTS classes(
  id TEXT PRIMARY KEY,
  class_code TEXT NOT NULL UNIQUE,
  teacher_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students(
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  class_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(class_id) REFERENCES classes(id)
);

CREATE INDEX IF NOT EXISTS idx_students_class_code ON students(class_code);

CREATE TABLE IF NOT EXISTS attempts(
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  class_code TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_student ON attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_attempts_class ON attempts(class_code);
