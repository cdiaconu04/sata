import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import db from "./db";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. /api/answers/generate will fail.");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type KnowledgeBaseRow = {
  id: string;
  category: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
};

type SecurityQuestionRow = {
  id: string;
  text: string;
  category: string | null;
  created_at: string;
};

type GeneratedAnswerRow = {
  id: string;
  question_id: string;
  question_text: string;
  answer_text: string;
  category: string | null;
  created_at: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2); // ignore very short words
}

function getRelevantKbEntries(
  questionText: string,
  maxEntries: number = 5,
): { row: KnowledgeBaseRow; score: number }[] {
  const allKb = db
    .prepare(`SELECT * FROM knowledge_base`)
    .all() as KnowledgeBaseRow[];

  const qTokens = new Set(tokenize(questionText));

  const scored = allKb.map((row) => {
    const corpus = `${row.question} ${row.answer}`;
    const tokens = tokenize(corpus);
    let score = 0;
    for (const t of tokens) {
      if (qTokens.has(t)) score += 1;
    }
    return { row, score };
  });

  const filtered = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxEntries);

  return filtered;
}

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Backend is running" });
});

// Knowledge base routes

// Upload many KB entries from JSON file
app.post("/api/kb/upload", (req, res) => {
  const entries = req.body as {
    id: string;
    category: string;
    question: string;
    answer: string;
  }[];

  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: "Body must be an array of entries" });
  }

  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO knowledge_base (id, category, question, answer, created_at, updated_at)
    VALUES (@id, @category, @question, @answer, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      category = excluded.category,
      question = excluded.question,
      answer = excluded.answer,
      updated_at = excluded.updated_at
  `);

  const tx = db.transaction((rows: typeof entries) => {
    for (const e of rows) {
      insert.run({
        id: e.id,
        category: e.category,
        question: e.question,
        answer: e.answer,
        created_at: now,
        updated_at: now,
      });
    }
  });

  tx(entries);

  res.json({ ok: true, count: entries.length });
});

// List KB entries
app.get("/api/kb", (req, res) => {
  const category = req.query.category as string | undefined;

  let rows;
  if (category) {
    rows = db
      .prepare(
        `SELECT * FROM knowledge_base WHERE category = ? ORDER BY created_at ASC`,
      )
      .all(category);
  } else {
    rows = db
      .prepare(`SELECT * FROM knowledge_base ORDER BY created_at ASC`)
      .all();
  }

  res.json(rows);
});

// Create a single KB entry
app.post("/api/kb", (req, res) => {
  const { id, category, question, answer } = req.body as {
    id: string;
    category: string;
    question: string;
    answer: string;
  };

  if (!id || !category || !question || !answer) {
    return res
      .status(400)
      .json({ error: "id, category, question, and answer are required" });
  }

  const now = new Date().toISOString();

  try {
    db.prepare(
      `
      INSERT INTO knowledge_base (id, category, question, answer, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    ).run(id, category, question, answer, now, now);

    const row = db
      .prepare(`SELECT * FROM knowledge_base WHERE id = ?`)
      .get(id);

    res.status(201).json(row);
  } catch (err: any) {
    return res
      .status(400)
      .json({ error: "Failed to create KB entry", details: err.message });
  }
});

// Update a KB entry
app.put("/api/kb/:id", (req, res) => {
  const kbId = req.params.id;
  const { category, question, answer } = req.body as {
    category?: string;
    question?: string;
    answer?: string;
  };

  const existing = db
    .prepare(`SELECT * FROM knowledge_base WHERE id = ?`)
    .get(kbId) as KnowledgeBaseRow | undefined;

  if (!existing) {
    return res.status(404).json({ error: "KB entry not found" });
  }

  const now = new Date().toISOString();

  const newCategory = category ?? existing.category;
  const newQuestion = question ?? existing.question;
  const newAnswer = answer ?? existing.answer;

  db.prepare(
    `
    UPDATE knowledge_base
    SET category = ?, question = ?, answer = ?, updated_at = ?
    WHERE id = ?
    `,
  ).run(newCategory, newQuestion, newAnswer, now, kbId);

  const updated = db
    .prepare(`SELECT * FROM knowledge_base WHERE id = ?`)
    .get(kbId) as KnowledgeBaseRow;

  res.json(updated);
});

// Delete a KB entry
app.delete("/api/kb/:id", (req, res) => {
  const kbId = req.params.id;

  const info = db
    .prepare(`DELETE FROM knowledge_base WHERE id = ?`)
    .run(kbId);

  if (info.changes === 0) {
    return res.status(404).json({ error: "KB entry not found" });
  }

  res.json({ ok: true });
});

// Security questions routes

app.post("/api/questions/upload", (req, res) => {
  const questions = req.body as { id: string; text: string }[];

  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: "Body must be an array of questions" });
  }

  const now = new Date().toISOString();

  const insert = db.prepare(`
    INSERT INTO security_questions (id, text, category, created_at)
    VALUES (@id, @text, @category, @created_at)
    ON CONFLICT(id) DO UPDATE SET
      text = excluded.text,
      category = excluded.category
  `);

  const tx = db.transaction((rows: typeof questions) => {
    for (const q of rows) {
      insert.run({
        id: q.id,
        text: q.text,
        category: null,
        created_at: now,
      });
    }
  });

  tx(questions);

  res.json({ ok: true, count: questions.length });
});

app.get("/api/questions", (req, res) => {
  const category = req.query.category as string | undefined;

  let rows;
  if (category) {
    rows = db
      .prepare(
        `SELECT * FROM security_questions WHERE category = ? ORDER BY created_at ASC`,
      )
      .all(category);
  } else {
    rows = db
      .prepare(`SELECT * FROM security_questions ORDER BY created_at ASC`)
      .all();
  }

  res.json(rows);
});

async function generateAnswerFromLlm(opts: {
  question: SecurityQuestionRow;
  context: KnowledgeBaseRow[];
}): Promise<{ answerText: string; category: string | null }> {
  const { question, context } = opts;

  const contextBlocks = context
    .map(
      (kb) =>
        `- [${kb.id}] (${kb.category}) Q: ${kb.question}\n  A: ${kb.answer}`,
    )
    .join("\n\n");

  const systemPrompt = `
    You are an information security analyst answering questionnaire questions using ONLY the provided knowledge base.
    If the knowledge base does not contain sufficient information to answer a question, respond exactly with:
    "No information available in the knowledge base."
    Do not invent policies or controls that are not in the context.
    Answer in a concise but complete sentence or short paragraph as appropriate.
    `.trim();

  const userPrompt = `
    Security questionnaire question:
    "${question.text}"

    Relevant knowledge base entries:
    ${contextBlocks || "(none found)"}

    Using ONLY the information above, answer the question. If nothing is relevant, reply exactly with:
    "No information available in the knowledge base."
    `.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
  });

  const answerText =
    response.choices[0]?.message?.content?.trim() ??
    "No information available in the knowledge base.";

  const category = context[0]?.category ?? question.category ?? null;

  return { answerText, category };
}

// Generated answers routes

// Generate answers for all questions
app.post("/api/answers/generate", async (_req, res) => {
    if (!process.env.OPENAI_API_KEY) {
        return res
        .status(500)
        .json({ error: "OPENAI_API_KEY is not configured on the server." });
    }

    try {
        const questions = db
            .prepare(`SELECT * FROM security_questions ORDER BY created_at ASC`)
            .all() as SecurityQuestionRow[];

        if (questions.length === 0) {
            return res.status(400).json({ error: "No security questions found." });
        }

        db.prepare(`DELETE FROM generated_answers`).run();

        const insert = db.prepare(`
            INSERT INTO generated_answers
                (id, question_id, question_text, answer_text, category, created_at)
            VALUES (@id, @question_id, @question_text, @answer_text, @category, @created_at)
        `);

        const now = new Date().toISOString();
        let generatedCount = 0;

        for (const q of questions) {
        const relevant = getRelevantKbEntries(q.text).map((s) => s.row);

        const { answerText, category } = await generateAnswerFromLlm({
            question: q,
            context: relevant,
        });

        const id = `ans_${crypto.randomUUID?.() ?? `${Date.now()}_${q.id}`}`;

        insert.run({
            id,
            question_id: q.id,
            question_text: q.text,
            answer_text: answerText,
            category,
            created_at: now,
        });

        generatedCount += 1;
        }

        res.json({ ok: true, count: generatedCount });
    } catch (err: any) {
        console.error("Error generating answers:", err);
        res
        .status(500)
        .json({ error: "Failed to generate answers", details: err.message });
    }
});

// List generated answers
app.get("/api/answers", (req, res) => {
    const category = req.query.category as string | undefined;

    let rows: GeneratedAnswerRow[];
    if (category) {
        rows = db
        .prepare(
            `SELECT * FROM generated_answers WHERE category = ? ORDER BY created_at ASC`,
        )
        .all(category) as GeneratedAnswerRow[];
    } else {
        rows = db
        .prepare(`SELECT * FROM generated_answers ORDER BY created_at ASC`)
        .all() as GeneratedAnswerRow[];
    }

    res.json(rows);
});



app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
