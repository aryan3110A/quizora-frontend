"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, Send, X } from "lucide-react";

type Question = {
  id: string;
  text: string;
  type: "SINGLE_SELECT";
  position: number;
  marks: number;
  options: Array<{ id: string; text: string; position: number }>;
};

type Attempt = {
  id: string;
  title: string;
  deadlineAt: string;
  questions: Question[];
  answers: Record<string, string>;
};

export default function QuizAttemptPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    api<Attempt>(`/student/quizzes/${quizId}/attempts`, { method: "POST", body: JSON.stringify({}) })
      .then((a) => {
        setAttempt(a);
        setAnswers(a.answers ?? {});
        setRemaining(Math.max(0, Math.floor((new Date(a.deadlineAt).getTime() - Date.now()) / 1000)));
      })
      .catch((e) => {
        if (e?.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "Could not start or resume this quiz.");
      });
  }, [quizId, router]);

  useEffect(() => {
    if (!attempt) return;
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [attempt]);

  const question = attempt?.questions[current];
  const time = useMemo(
    () => `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`,
    [remaining]
  );

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((v) => Boolean(v)).length;
  }, [answers]);

  const totalQuestions = attempt?.questions.length ?? 0;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  async function choose(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    setSaved((prev) => ({ ...prev, [questionId]: false }));
    try {
      await api(`/student/attempts/${attempt!.id}/answers/${questionId}`, {
        method: "PUT",
        body: JSON.stringify({ selectedOptionId: optionId })
      });
      setSaved((prev) => ({ ...prev, [questionId]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Answer save failed. Please retry.");
    }
  }

  function requestSubmit() {
    if (!attempt || submitting) return;
    setShowConfirmModal(true);
  }

  async function performSubmit() {
    if (!attempt || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api(`/student/attempts/${attempt.id}/submit`, { method: "POST", body: JSON.stringify({}) });
      router.replace(`/results/${attempt.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed. Check your connection and retry.");
      setSubmitting(false);
      setShowConfirmModal(false);
    }
  }

  if (error && !attempt) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{error}</div>
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f8ff]">
        <LoaderCircle className="animate-spin text-blue-600" size={32} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Quiz in progress</p>
            <h1 className="mt-1 font-bold text-blue-950">{attempt.title}</h1>
          </div>
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-lg font-bold ${
              remaining < 300 ? "bg-red-50 text-red-700 animate-pulse" : "bg-blue-50 text-blue-800"
            }`}
          >
            <Clock3 size={18} />
            {time}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-7 lg:grid-cols-[1fr_260px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 md:p-9 shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Question {current + 1} of {attempt.questions.length}
            </span>
            <span>{question?.marks ?? 0} marks</span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${((current + 1) / attempt.questions.length) * 100}%` }}
            />
          </div>

          {question && (
            <>
              <h2 className="mt-8 whitespace-pre-wrap text-xl font-semibold leading-8 text-slate-900">
                {question.text}
              </h2>
              <div className="mt-6 space-y-3">
                {question.options.map((o, i) => {
                  const selected = answers[question.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => choose(question.id, o.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition ${
                        selected
                          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-semibold ${
                          selected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1 pt-0.5 text-slate-800 leading-relaxed">{o.text}</span>
                      {selected && <CheckCircle2 className="text-blue-600 shrink-0 mt-0.5" size={19} />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 text-xs text-slate-500">
                {saved[question.id] === true
                  ? "✓ Answer saved"
                  : answers[question.id]
                  ? "Saving answer…"
                  : "Choose an answer"}{" "}
                · Answers save automatically
              </div>
            </>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-8 flex flex-wrap justify-between gap-3">
            <button
              disabled={current === 0}
              onClick={() => setCurrent((v) => v - 1)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-40"
            >
              Previous
            </button>
            {current < attempt.questions.length - 1 ? (
              <button
                onClick={() => setCurrent((v) => v + 1)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 transition"
              >
                Next question
              </button>
            ) : (
              <button
                disabled={submitting}
                onClick={requestSubmit}
                className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-2"
              >
                <Send size={16} />
                Submit quiz
              </button>
            )}
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-blue-950">Navigator</h2>
            <span className="text-xs font-semibold text-slate-500">
              {answeredCount}/{totalQuestions} done
            </span>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {attempt.questions.map((q, i) => (
              <button
                key={q.id}
                onClick={() => setCurrent(i)}
                aria-label={`Go to question ${i + 1}`}
                className={`aspect-square rounded-lg border text-sm font-semibold transition ${
                  current === i
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : answers[q.id]
                    ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-2 text-xs text-slate-500 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-blue-500 inline-block" />
              <span>Current question</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-blue-100 border border-blue-300 inline-block" />
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-white border border-slate-300 inline-block" />
              <span>Unanswered ({unansweredCount})</span>
            </div>
          </div>

          <button
            disabled={submitting}
            onClick={requestSubmit}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-sm"
          >
            <Send size={16} />
            Submit quiz
          </button>
        </aside>
      </div>

      {/* Styled Confirmation Modal */}
      {showConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <button
              onClick={() => !submitting && setShowConfirmModal(false)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                <AlertTriangle size={24} />
              </span>
              <div className="pr-6">
                <h3 className="text-lg font-bold text-slate-900">Submit Assessment?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Once submitted, your answers will be recorded and you cannot retake or modify this quiz.
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Answered questions</span>
                <span className="font-semibold text-emerald-700">
                  {answeredCount} of {totalQuestions}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Unanswered</span>
                <span className={`font-semibold ${unansweredCount > 0 ? "text-amber-600" : "text-slate-600"}`}>
                  {unansweredCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Time remaining</span>
                <span className="font-mono font-semibold text-blue-700">{time}</span>
              </div>
            </div>

            {unansweredCount > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">⚠️ Attention:</p>
                <p className="mt-0.5">
                  You still have {unansweredCount} unanswered {unansweredCount === 1 ? "question" : "questions"}.
                  Are you sure you want to finish now?
                </p>
              </div>
            )}

            {error && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submitting}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Return to quiz
              </button>
              <button
                type="button"
                onClick={performSubmit}
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-2 shadow-sm"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" size={16} /> Submitting…
                  </>
                ) : (
                  <>
                    <Send size={15} /> Yes, submit quiz
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
