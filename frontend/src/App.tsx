import { useEffect, useState } from "react";
import "./index.css";
import type {
  KnowledgeBaseEntry,
  SecurityQuestion,
  GeneratedAnswer,
} from "./types";

type KbFormState = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

function App() {
  // Knowledge base state
  const [kb, setKb] = useState<KnowledgeBaseEntry[]>([]);
  const [kbUploading, setKbUploading] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbEditingId, setKbEditingId] = useState<string | null>(null);
  const [kbForm, setKbForm] = useState<KbFormState>({
    id: "",
    category: "",
    question: "",
    answer: "",
  });

  // Security questions state ---
  const [questions, setQuestions] = useState<SecurityQuestion[]>([]);
  const [questionsUploading, setQuestionsUploading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Generated answers state ---
  const [answers, setAnswers] = useState<GeneratedAnswer[]>([]);
  const [answerSelectedCategories, setAnswerSelectedCategories] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  // Helpers for knowledge base

  async function fetchKb() {
    const res = await fetch("http://localhost:4000/api/kb");
    const data = await res.json();
    setKb(data);
  }

  function resetKbForm() {
    setKbForm({ id: "", category: "", question: "", answer: "" });
    setKbEditingId(null);
  }

  async function handleKbUpload(file: File) {
    try {
      setKbUploading(true);
      const text = await file.text();
      const json = JSON.parse(text);

      await fetch("http://localhost:4000/api/kb/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });

      await fetchKb();
    } catch (err) {
      console.error(err);
      alert("Failed to upload KB JSON");
    } finally {
      setKbUploading(false);
    }
  }

  async function handleKbFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!kbForm.id || !kbForm.category || !kbForm.question || !kbForm.answer) {
      alert("All KB fields are required");
      return;
    }

    try {
      setKbSaving(true);

      if (kbEditingId) {
        const res = await fetch(
          `http://localhost:4000/api/kb/${encodeURIComponent(kbEditingId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              category: kbForm.category,
              question: kbForm.question,
              answer: kbForm.answer,
            }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to update KB entry");
        }
      } else {
        const res = await fetch("http://localhost:4000/api/kb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kbForm),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to create KB entry");
        }
      }

      await fetchKb();
      resetKbForm();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to save KB entry");
    } finally {
      setKbSaving(false);
    }
  }

  function startKbEdit(entry: KnowledgeBaseEntry) {
    setKbEditingId(entry.id);
    setKbForm({
      id: entry.id,
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
    });
  }

  async function handleKbDelete(id: string) {
    if (!confirm(`Delete KB entry ${id}?`)) return;

    try {
      const res = await fetch(
        `http://localhost:4000/api/kb/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete KB entry");
      }
      await fetchKb();
      if (kbEditingId === id) {
        resetKbForm();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to delete KB entry");
    }
  }

  // Helpers for security questions

  async function fetchQuestions() {
    const res = await fetch("http://localhost:4000/api/questions");
    const data = await res.json();
    setQuestions(data);
  }

  async function handleQuestionsUpload(file: File) {
    try {
      setQuestionsUploading(true);
      const text = await file.text();
      const raw = JSON.parse(text) as {
        id: string;
        text: string;
        expected_answer?: string;
      }[];

      const payload = raw.map((q) => ({ id: q.id, text: q.text }));

      await fetch("http://localhost:4000/api/questions/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await fetchQuestions();
    } catch (err) {
      console.error(err);
      alert("Failed to upload security questions JSON");
    } finally {
      setQuestionsUploading(false);
    }
  }

  const allCategories = Array.from(
    new Set(
      questions.map((q) => (q.category === null ? "Uncategorized" : q.category))
    )
  );

  const filteredQuestions =
    selectedCategories.length === 0
      ? questions
      : questions.filter((q) => {
          const cat = q.category ?? "Uncategorized";
          return selectedCategories.includes(cat);
        });

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  // Helper for generated answers

  async function fetchAnswers() {
    const res = await fetch("http://localhost:4000/api/answers");
    const data = await res.json();
    setAnswers(data);
  }

  async function handleGenerateAnswers() {
    try {
      if (questions.length === 0) {
        alert("Upload security questions first.");
        return;
      }

      setGenerating(true);
      const res = await fetch("http://localhost:4000/api/answers/generate", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate answers");
      }

      // Reload answers from backend
      await fetchAnswers();
      alert(`Generated ${data.count} answers.`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate answers");
    } finally {
      setGenerating(false);
    }
  }

  const allAnswerCategories = Array.from(
    new Set(
      answers.map((a) =>
        a.category === null || a.category === "" ? "Uncategorized" : a.category
      )
    )
  );

  const filteredAnswers =
    answerSelectedCategories.length === 0
      ? answers
      : answers.filter((a) => {
          const cat = a.category ?? "Uncategorized";
          return answerSelectedCategories.includes(cat);
        });

  function toggleAnswerCategory(cat: string) {
    setAnswerSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }


  useEffect(() => {
    fetchKb().catch(console.error);
    fetchQuestions().catch(console.error);
    fetchAnswers().catch(console.error);
  }, []);


  return (
    <div className="w-screen min-h-screen bg-gray-950 text-white flex flex-col items-center p-8 gap-8">
      <h1 className="text-3xl font-bold">
        Sentri AI Questionnaire System
      </h1>

      {/* Knowledge base section */}
      <section className="w-full max-w-6xl bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Knowledge Base</h2>

          <label className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 cursor-pointer text-sm font-medium">
            <span>{kbUploading ? "Uploading..." : "Upload KB JSON"}</span>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleKbUpload(file);
              }}
              disabled={kbUploading}
            />
          </label>
        </div>

        <form
          onSubmit={handleKbFormSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-800/60 rounded-lg p-4"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-gray-400">
              ID
            </label>
            <input
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-sm outline-none focus:border-blue-500"
              placeholder="kb_custom_1"
              value={kbForm.id}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, id: e.target.value.trim() }))
              }
              disabled={!!kbEditingId}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-gray-400">
              Category
            </label>
            <input
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-sm outline-none focus:border-blue-500"
              placeholder="Access Management"
              value={kbForm.category}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, category: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-gray-400">
              Question
            </label>
            <textarea
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-sm outline-none focus:border-blue-500 resize-y min-h-[60px]"
              value={kbForm.question}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, question: e.target.value }))
              }
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-gray-400">
              Answer
            </label>
            <textarea
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-sm outline-none focus:border-blue-500 resize-y min-h-[80px]"
              value={kbForm.answer}
              onChange={(e) =>
                setKbForm((f) => ({ ...f, answer: e.target.value }))
              }
            />
          </div>

          <div className="flex items-center gap-3 md:col-span-2 justify-end">
            {kbEditingId && (
              <button
                type="button"
                className="px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm"
                onClick={resetKbForm}
              >
                Cancel edit
              </button>
            )}
            <button
              type="submit"
              disabled={kbSaving}
              className="px-4 py-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm font-medium disabled:opacity-60"
            >
              {kbSaving
                ? kbEditingId
                  ? "Saving..."
                  : "Creating..."
                : kbEditingId
                ? "Save changes"
                : "Add entry"}
            </button>
          </div>
        </form>

        {kb.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No knowledge base entries yet. Upload the sample JSON or add one
            above.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[360px] border border-gray-800 rounded-lg">
            <table className="min-w-full text-xs md:text-sm text-left border-collapse">
              <thead className="bg-gray-800/90">
                <tr>
                  <th className="px-3 py-2 border-b border-gray-700">ID</th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Category
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Question
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Answer
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Created
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Updated
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {kb.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-800/60">
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {row.id}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {row.category}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {row.question}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {row.answer}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top whitespace-nowrap">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top whitespace-nowrap">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleString()
                        : "-"}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-[11px] md:text-xs"
                          onClick={() => startKbEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-[11px] md:text-xs"
                          onClick={() => handleKbDelete(row.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Security questions section */}
      <section className="w-full max-w-6xl bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Security Questions</h2>

          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-600 cursor-pointer text-sm font-medium">
              <span>
                {questionsUploading ? "Uploading..." : "Upload Questions JSON"}
              </span>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleQuestionsUpload(file);
                }}
                disabled={questionsUploading}
              />
            </label>

            <button
              type="button"
              onClick={handleGenerateAnswers}
              disabled={generating || questions.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-medium disabled:opacity-60"
            >
              {generating ? "Generating..." : "Generate Answers"}
            </button>
          </div>
        </div>

        {allCategories.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <span className="text-gray-400">Filter by category:</span>
            {allCategories.map((cat) => (
              <label
                key={cat}
                className="inline-flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-purple-500"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                />
                <span className="px-2 py-1 rounded-full bg-gray-800">
                  {cat}
                </span>
              </label>
            ))}
            {selectedCategories.length > 0 && (
              <button
                type="button"
                className="text-xs text-gray-300 underline"
                onClick={() => setSelectedCategories([])}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Questions table */}
        {questions.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No security questions yet. Upload the provided
            <span className="font-mono"> sample_security_questions.json</span>.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[360px] border border-gray-800 rounded-lg">
            <table className="min-w-full text-xs md:text-sm text-left border-collapse">
              <thead className="bg-gray-800/90">
                <tr>
                  <th className="px-3 py-2 border-b border-gray-700">ID</th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Question
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Category
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-800/60">
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {q.id}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {q.text}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {q.category ?? "Uncategorized"}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top whitespace-nowrap">
                      {q.created_at
                        ? new Date(q.created_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Results section */}
      <section className="w-full max-w-6xl bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Results</h2>
          <button
            type="button"
            onClick={() => fetchAnswers().catch(console.error)}
            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm font-medium"
          >
            Refresh
          </button>
        </div>

        {allAnswerCategories.length > 0 && (
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <span className="text-gray-400">Filter by category:</span>
            {allAnswerCategories.map((cat) => (
              <label
                key={cat}
                className="inline-flex items-center gap-1 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-emerald-500"
                  checked={answerSelectedCategories.includes(cat)}
                  onChange={() => toggleAnswerCategory(cat)}
                />
                <span className="px-2 py-1 rounded-full bg-gray-800">
                  {cat}
                </span>
              </label>
            ))}
            {answerSelectedCategories.length > 0 && (
              <button
                type="button"
                className="text-xs text-gray-300 underline"
                onClick={() => setAnswerSelectedCategories([])}
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {answers.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No generated answers yet. Upload questions and click{" "}
            <span className="font-semibold">Generate Answers</span>.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[360px] border border-gray-800 rounded-lg">
            <table className="min-w-full text-xs md:text-sm text-left border-collapse">
              <thead className="bg-gray-800/90">
                <tr>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Question
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Answer
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Category
                  </th>
                  <th className="px-3 py-2 border-b border-gray-700">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAnswers.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-800/60">
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {a.question_text}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {a.answer_text}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top">
                      {a.category ?? "Uncategorized"}
                    </td>
                    <td className="px-3 py-2 border-b border-gray-800 align-top whitespace-nowrap">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
