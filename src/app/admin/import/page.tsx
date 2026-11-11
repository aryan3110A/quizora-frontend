"use client";
import { ChangeEvent, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { FileSpreadsheet, UploadCloud } from "lucide-react";

type Preview = {
  importId: string;
  validCount: number;
  errors: Array<{ row: number; message: string }>;
  questions: Array<{
    question: string;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    correctAnswer: string;
    topic?: string;
  }>;
};

function ImportContent() {
  const params = useSearchParams();
  const quizId = params.get("quizId") ?? "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  function change(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setPreview(null);
    setError("");
    setDone("");
  }

  async function upload() {
    if (!file || !quizId) {
      setError("Select a file and open this page from a draft quiz.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const p = await api<Preview>(`/admin/quizzes/${quizId}/questions/import/preview`, {
        method: "POST",
        body: form
      });
      setPreview(p);
      if (p.errors.length > 0) {
        if (p.validCount === 0) {
          setError(`Validation failed: All ${p.errors.length} rows contain formatting errors. Check the error list below.`);
        } else {
          setError(`Notice: Found ${p.errors.length} error(s) in your file. ${p.validCount} valid question(s) can be imported.`);
        }
      } else {
        setDone(`Validation passed! All ${p.validCount} questions are valid. Click "Confirm import" below to finish.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ imported: number }>(`/admin/quizzes/${quizId}/questions/import/confirm`, {
        method: "POST",
        body: JSON.stringify({ importId: preview.importId })
      });
      setDone(`${result.imported} questions imported successfully. Review the quiz before publishing.`);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const [published, setPublished] = useState(false);

  async function publish() {
    if (!quizId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/quizzes/${quizId}/publish`, { method: "POST" });
      setPublished(true);
      setDone("✓ Quiz published successfully! It is now live and visible to eligible students.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff] px-5 py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin" className="text-sm font-semibold text-blue-700">
          ← Admin dashboard
        </Link>
        <h1 className="mt-5 text-3xl font-bold text-blue-950">Bulk question import</h1>
        <p className="mt-2 text-slate-500">
          Upload a CSV or Excel file, review validation, and import questions into your draft quiz.
        </p>
        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <div className="flex items-start gap-4">
            <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <FileSpreadsheet size={24} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">Question file</h2>
              <p className="mt-1 text-sm text-slate-500">
                Required headers: Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer (or Correct Option & Explanation). Optional: Explanation,
                Topic, Marks, NegativeMarks, Difficulty.
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
            <UploadCloud className="mx-auto text-blue-600" size={32} />
            <label className="mt-3 block font-semibold text-slate-800">
              Choose your question bank
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={change}
                className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">CSV or XLSX · Maximum size is configured by the backend</p>
            {file && <p className="mt-3 text-sm font-medium text-blue-800">{file.name}</p>}
          </div>
          <button
            disabled={busy || !file}
            onClick={upload}
            className="mt-5 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Processing…" : "Validate and preview"}
          </button>
          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {done && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950 shadow-sm">
              <p className="font-semibold">{done}</p>
              {!published && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={publish}
                    disabled={busy}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {busy ? "Publishing…" : "Publish quiz now"}
                  </button>
                  <Link
                    href="/admin"
                    className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 font-semibold text-emerald-800 hover:bg-emerald-100 transition"
                  >
                    Return to Admin Dashboard
                  </Link>
                </div>
              )}
              {published && (
                <div className="mt-4">
                  <Link
                    href="/admin"
                    className="inline-block rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 transition"
                  >
                    Go to Admin Dashboard
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
        {preview && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-blue-950">Import preview</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {preview.validCount} valid questions · {preview.errors.length} validation errors
                </p>
              </div>
              <button
                disabled={busy || preview.validCount === 0 || preview.errors.length > 0}
                onClick={confirm}
                className="rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-40"
              >
                {busy ? "Importing…" : "Confirm import"}
              </button>
            </div>
            {preview.errors.length > 0 && (
              <div className="mt-4 rounded-xl bg-red-50 p-4">
                <h3 className="font-semibold text-red-800">Fix these errors before import</h3>
                <ul className="mt-2 list-inside list-disc text-sm text-red-700">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="p-3">Question</th>
                    <th className="p-3">Option A</th>
                    <th className="p-3">Option B</th>
                    <th className="p-3">Correct</th>
                    <th className="p-3">Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.questions.map((q, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="max-w-sm whitespace-pre-wrap p-3">{q.question}</td>
                      <td className="p-3">{q.optionA}</td>
                      <td className="p-3">{q.optionB}</td>
                      <td className="p-3 font-semibold text-blue-700">{q.correctAnswer}</td>
                      <td className="p-3">{q.topic ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f5f8ff] p-8 text-slate-500">Loading import page...</div>}>
      <ImportContent />
    </Suspense>
  );
}
