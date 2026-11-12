"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Send, WifiOff, X } from "lucide-react";
import { ExamController } from "@/lib/exam/examController";
import { httpExamApi } from "@/lib/exam/examApi";
import { localStoragePendingStore } from "@/lib/exam/storage";

function formatTime(totalSeconds: number) {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export default function QuizAttemptPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const router = useRouter();
  // All exam logic (server-clock countdown, autosave queue, auto-submit, status polling) lives in the controller.
  const [controller] = useState(() => new ExamController({ quizId, api: httpExamApi, createStore: localStoragePendingStore }));
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [current, setCurrent] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    void controller.start();
    const onOnline = () => controller.onOnline();
    const onOffline = () => controller.onOffline();
    const onVisibility = () => {
      if (document.visibilityState === "visible") controller.onVisible();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
      controller.stop();
    };
  }, [controller]);

  useEffect(() => {
    if (snap.redirectTo) router.replace(snap.redirectTo);
  }, [snap.redirectTo, router]);

  useEffect(() => {
    if (snap.phase === "unauthenticated") router.replace("/login");
  }, [snap.phase, router]);

  const attempt = snap.attempt;
  const answers = snap.answers;
  const question = attempt?.questions[current];
  const time = formatTime(snap.remainingSeconds);
  const remaining = snap.remainingSeconds;
  const totalQuestions = attempt?.questions.length ?? 0;
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const locked = snap.timeUp || snap.submitting;

  function requestSubmit() {
    if (!attempt || snap.submitting || snap.timeUp) return;
    setShowConfirmModal(true);
  }

  function performSubmit() {
    void controller.submit("manual", { force: snap.submitBlocked });
  }

  if (!attempt && (snap.phase === "error" || snap.phase === "ended")) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">{snap.error}</div>
        <div className="mt-4 flex gap-3">
          {snap.phase === "error" && (
            <button
              onClick={() => void controller.restart()}
              className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw size={15} /> Try again
            </button>
          )}
          <Link href="/dashboard" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (!attempt || snap.phase === "submitted") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f8ff]">
        <LoaderCircle className="animate-spin text-blue-600" size={32} />
      </main>
    );
  }

  const status = question ? snap.saveStatus[question.id] : undefined;

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

      {(snap.offline || snap.timeUp || snap.failedCount > 0) && (
        <div className="mx-auto max-w-6xl space-y-2 px-5 pt-5">
          {snap.timeUp && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              <LoaderCircle className="animate-spin" size={16} />
              Time is up. Submitting your saved answers{snap.offline ? " — waiting for your connection, this will retry automatically" : ""}…
            </div>
          )}
          {snap.offline && !snap.timeUp && (
            <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <WifiOff size={16} />
              <span>
                <strong>You appear to be offline.</strong> Your answers are kept on this device and will be saved automatically when the
                connection returns. Keep this page open.
              </span>
            </div>
          )}
          {snap.failedCount > 0 && !snap.timeUp && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>
                {snap.failedCount} {snap.failedCount === 1 ? "answer is" : "answers are"} not saved yet — retrying automatically.
              </span>
              <button onClick={() => controller.retrySave()} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">
                Retry now
              </button>
            </div>
          )}
        </div>
      )}

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
              <h2 className="mt-8 whitespace-pre-wrap text-xl font-semibold leading-8 text-slate-900">{question.text}</h2>
              <div className="mt-6 space-y-3">
                {question.options.map((o, i) => {
                  const selected = answers[question.id] === o.id;
                  return (
                    <button
                      key={o.id}
                      disabled={locked}
                      onClick={() => controller.choose(question.id, o.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed ${
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
              <div className="mt-5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                {status === "failed" ? (
                  <>
                    <span className="font-semibold text-red-700">⚠ Not saved yet — retrying automatically</span>
                    <button onClick={() => controller.retrySave(question.id)} className="font-semibold text-blue-700 underline">
                      Retry now
                    </button>
                  </>
                ) : status === "pending" || status === "saving" ? (
                  <span>Saving answer…</span>
                ) : answers[question.id] ? (
                  <span>✓ Answer saved</span>
                ) : (
                  <span>Choose an answer</span>
                )}
                <span>· Answers save automatically</span>
              </div>
            </>
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
                disabled={locked}
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
                    : snap.saveStatus[q.id] === "failed"
                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
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
            {snap.failedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-red-100 border border-red-300 inline-block" />
                <span>Not saved yet ({snap.failedCount})</span>
              </div>
            )}
          </div>

          <button
            disabled={locked}
            onClick={requestSubmit}
            className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
          >
            <Send size={16} />
            Submit quiz
          </button>
        </aside>
      </div>

      {/* Styled Confirmation Modal */}
      {showConfirmModal && !snap.timeUp && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <button
              onClick={() => !snap.submitting && setShowConfirmModal(false)}
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
                <span className={`font-semibold ${unansweredCount > 0 ? "text-amber-600" : "text-slate-600"}`}>{unansweredCount}</span>
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
                  You still have {unansweredCount} unanswered {unansweredCount === 1 ? "question" : "questions"}. Are you sure you want to
                  finish now?
                </p>
              </div>
            )}

            {snap.submitError && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                {snap.submitError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={snap.submitting}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Return to quiz
              </button>
              <button
                type="button"
                onClick={performSubmit}
                disabled={snap.submitting}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-60 flex items-center gap-2 shadow-sm"
              >
                {snap.submitting ? (
                  <>
                    <LoaderCircle className="animate-spin" size={16} /> Saving &amp; submitting…
                  </>
                ) : snap.submitBlocked ? (
                  <>
                    <Send size={15} /> Submit anyway
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
