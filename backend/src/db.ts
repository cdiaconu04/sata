import Database from "better-sqlite3";

const db = new Database("sentri-ai.db");

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_base (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS security_questions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS generated_answers (
    id TEXT PRIMARY KEY,
    question_id TEXT NOT NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    category TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (question_id) REFERENCES security_questions(id)
  );
`);

export default db;
