"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  LogOut,
  Plus,
  Users,
  X
} from "lucide-react";
import { api } from "@/lib/api";

type AdminData = {
  stats: {
    students: number;
    quizzes: number;
    scheduled: number;
    attempts: number;
    publishedQuizzes?: number;
    draftQuizzes?: number;
  };
  streamsBreakdown?: Array<{ code: string; name: string; count: number }>;
  recentAttempts?: Array<{
    id: string;
    studentId: string;
    fullName: string;
    quizTitle: string;
    score: number | null;
    totalMarks: number | null;
    status: string;
    createdAt: string;
  }>;
  recentQuizzes: Array<{
    id: string;
    title: string;
    status: string;
    startsAt: string;
    endsAt: string;
    questionCount?: number;
    streamCodes?: string[];
  }>;
};

type CardModalType = "students" | "quizzes" | "scheduled" | "attempts" | null;

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<CardModalType>(null);

  useEffect(() => {
    api<AdminData>("/admin/dashboard")
      .then(setData)
      .catch((e) => {
        if (e?.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "Unable to load admin dashboard.");
      });
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    router.replace("/login");
  }

  async function publishQuiz(quizId: string) {
    setPublishingId(quizId);
    setActionMsg("");
    try {
      await api(`/admin/quizzes/${quizId}/publish`, { method: "POST" });
      setActionMsg("✓ Quiz published successfully! It is now active and visible to eligible students.");
      const updated = await api<AdminData>("/admin/dashboard");
      setData(updated);
    } catch (err) {
      setActionMsg(`Failed to publish: ${err instanceof Error ? err.message : "Error publishing quiz"}`);
    } finally {
      setPublishingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3 font-bold text-blue-950">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white">
              <GraduationCap />
            </span>
            <span>
              QUIZORA <span className="block text-xs font-medium text-slate-500">Administration</span>
            </span>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-9 md:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-blue-700">ADMINISTRATION</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-blue-950">Admin dashboard</h1>
            <p className="mt-2 text-slate-500">Manage assessments, students, and schedules.</p>
          </div>
          <Link
            href="/admin/quizzes/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 transition shadow-sm"
          >
            <Plus size={18} /> Create quiz
          </Link>
        </div>

        {error && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="font-bold text-base text-red-950">Administrator Access Required</p>
                <p className="text-sm mt-1 text-red-800">
                  You are currently logged in with a <strong>Student account</strong>. To access this administration portal,
                  please sign out and log in with the administrator ID <code>ADMIN001</code>.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-semibold text-red-900 hover:bg-red-100 shadow-sm transition"
                >
                  Go to Student Dashboard
                </Link>
                <button
                  onClick={logout}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition"
                >
                  Sign out & Switch Account
                </button>
              </div>
            </div>
          </div>
        )}

        {actionMsg && (
          <div
            className={`mt-6 rounded-2xl border p-4 text-sm font-semibold ${
              actionMsg.startsWith("✓")
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {actionMsg}
          </div>
        )}

        {/* 4 Clickable Metric Cards */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              type: "students" as CardModalType,
              label: "Registered students",
              value: data?.stats.students ?? "—",
              icon: Users,
              hint: "View stream enrollment & accounts"
            },
            {
              type: "quizzes" as CardModalType,
              label: "Total quizzes",
              value: data?.stats.quizzes ?? "—",
              icon: BookOpen,
              hint: "View drafts & published inventory"
            },
            {
              type: "scheduled" as CardModalType,
              label: "Scheduled quizzes",
              value: data?.stats.scheduled ?? "—",
              icon: CalendarClock,
              hint: "View scheduled upcoming assessments"
            },
            {
              type: "attempts" as CardModalType,
              label: "Attempts recorded",
              value: data?.stats.attempts ?? "—",
              icon: FileSpreadsheet,
              hint: "View student attempt submissions"
            }
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setActiveModal(s.type)}
              className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-400 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600 group-hover:text-blue-700 transition">
                  {s.label}
                </p>
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                  <s.icon size={20} />
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold text-blue-950">{s.value}</p>
              <p className="mt-2 text-xs text-blue-600 flex items-center gap-1 font-medium">
                <span>{s.hint}</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </p>
            </button>
          ))}
        </div>

        <div className="mt-9 grid gap-6 lg:grid-cols-[1.65fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-blue-950">Recent quizzes</h2>
            <p className="mt-1 text-sm text-slate-500">Review scheduled assessments & publish when ready</p>
            <div className="mt-5 overflow-x-auto">
              {data?.recentQuizzes.length ? (
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="pb-3 font-medium">Quiz</th>
                      <th className="pb-3 font-medium">Streams</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Questions</th>
                      <th className="pb-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentQuizzes.map((q) => {
                      const isDraft = q.status === "DRAFT";
                      const count = q.questionCount ?? 0;
                      return (
                        <tr key={q.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-4 pr-3">
                            <p className="font-semibold text-slate-800">{q.title}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(q.startsAt).toLocaleString()}</p>
                          </td>
                          <td className="py-4 pr-2">
                            <div className="flex flex-wrap gap-1">
                              {q.streamCodes?.map((code) => (
                                <span
                                  key={code}
                                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                                    code === "MCE"
                                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-4 pr-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isDraft
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {q.status}
                            </span>
                          </td>
                          <td className="py-4 pr-2 text-xs font-medium text-slate-600">
                            {count > 0 ? (
                              <span className="font-semibold text-blue-700">{count} MCQs</span>
                            ) : (
                              <span className="text-red-500 font-semibold">0 MCQs</span>
                            )}
                          </td>
                          <td className="py-4 text-right">
                            {isDraft ? (
                              <div className="flex items-center justify-end gap-2">
                                {count > 0 ? (
                                  <button
                                    onClick={() => publishQuiz(q.id)}
                                    disabled={publishingId === q.id}
                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                                  >
                                    {publishingId === q.id ? "Publishing…" : "Publish"}
                                  </button>
                                ) : (
                                  <Link
                                    href={`/admin/import?quizId=${q.id}`}
                                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition shadow-sm"
                                  >
                                    Import MCQs
                                  </Link>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-semibold text-emerald-700">✓ Published</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">
                  No quizzes created yet. Create your first quiz to get started.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
            <h2 className="text-lg font-bold text-blue-950">Quick actions</h2>
            <div className="mt-4 space-y-3">
              {[
                { href: "/admin/quizzes/new", title: "Create a quiz", desc: "Set schedule, streams, and scoring", icon: Plus },
                { href: "/admin/students", title: "Manage students", desc: "Review accounts and streams", icon: Users },
                { href: "/admin/import", title: "Bulk question import", desc: "Import MCQs from CSV or Excel", icon: FileSpreadsheet }
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                    <a.icon size={19} />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-800">{a.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">{a.desc}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Interactive Information Modals for the 4 Cards */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Modal: Registered Students */}
            {activeModal === "students" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200">
                    <Users size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Registered Students Overview</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Enrolled student accounts by academic stream and security status.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Stream Distribution</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {data?.streamsBreakdown?.map((s) => (
                      <div key={s.code} className="rounded-xl bg-white border border-slate-200 p-3 shadow-xs">
                        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {s.code}
                        </span>
                        <p className="mt-2 text-xl font-bold text-slate-900">{s.count}</p>
                        <p className="text-xs text-slate-400 truncate">{s.name}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-blue-600" /> One-Time Password Policy Active
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Student accounts (e.g. <code>26MCE001@nirmauni.ac.in</code> to <code>032</code>) have initial passwords equal to their Student ID and can change their password once in their profile. If locked or forgotten, administrators can reset them anytime.
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <Link
                    href="/admin/students"
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition flex items-center gap-1.5"
                  >
                    Manage Students Page <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            )}

            {/* Modal: Total Quizzes */}
            {activeModal === "quizzes" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                    <BookOpen size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Quiz Inventory Breakdown</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Summary of all draft, published, and archived assessments.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-center">
                    <p className="text-xs font-semibold text-slate-500">Total Created</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{data?.stats.quizzes ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                    <p className="text-xs font-semibold text-emerald-700">Published</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-800">{data?.stats.publishedQuizzes ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
                    <p className="text-xs font-semibold text-amber-700">Drafts</p>
                    <p className="mt-1 text-2xl font-bold text-amber-800">{data?.stats.draftQuizzes ?? 0}</p>
                  </div>
                </div>

                <div className="mt-5 max-h-52 overflow-y-auto space-y-2 border-t border-slate-100 pt-3">
                  {data?.recentQuizzes.slice(0, 6).map((q) => (
                    <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-2.5 text-xs hover:bg-slate-50">
                      <div>
                        <p className="font-semibold text-slate-800">{q.title}</p>
                        <p className="text-slate-400 mt-0.5">{q.questionCount ?? 0} questions · Streams: {q.streamCodes?.join(", ")}</p>
                      </div>
                      <span className={`px-2 py-0.5 font-bold rounded-full ${q.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                        {q.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <Link
                    href="/admin/quizzes/new"
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition flex items-center gap-1.5"
                  >
                    Create New Quiz <Plus size={15} />
                  </Link>
                </div>
              </div>
            )}

            {/* Modal: Scheduled Quizzes */}
            {activeModal === "scheduled" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                    <CalendarClock size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Scheduled Assessments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Assessments published and queued to open at a designated start time.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-900">Active Scheduled Quizzes</span>
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                      {data?.stats.scheduled ?? 0} Scheduled
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-800 leading-relaxed">
                    When a published quiz reaches its <code>startsAt</code> schedule, it automatically appears under &quot;Available quizzes&quot; for all students whose academic stream matches.
                  </p>
                </div>

                <div className="mt-5 max-h-56 overflow-y-auto space-y-2.5">
                  {data?.recentQuizzes.filter((q) => q.status === "PUBLISHED").map((q) => (
                    <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{q.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                            <Clock3 size={13} />
                            <span>Starts: {new Date(q.startsAt).toLocaleString()}</span>
                          </div>
                        </div>
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          {q.streamCodes?.join(", ")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <Link
                    href="/admin/quizzes/new"
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Schedule Assessment
                  </Link>
                </div>
              </div>
            )}

            {/* Modal: Attempts Recorded */}
            {activeModal === "attempts" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <FileSpreadsheet size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Recorded Assessment Attempts</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Total student submission activity and recent scoring events.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Total Completed Attempts</p>
                    <p className="mt-1 text-2xl font-bold text-blue-950">{data?.stats.attempts ?? 0}</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 text-emerald-800 font-semibold text-xs px-3 py-1">
                    1-Attempt Security Enforced
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Recent Submissions</p>
                  <div className="max-h-56 overflow-y-auto space-y-2">
                    {data?.recentAttempts && data.recentAttempts.length > 0 ? (
                      data.recentAttempts.map((a) => (
                        <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs">
                          <div>
                            <p className="font-semibold text-slate-900">{a.fullName} ({a.studentId})</p>
                            <p className="text-slate-500 mt-0.5">{a.quizTitle} · {new Date(a.createdAt).toLocaleTimeString()}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              {a.score !== null ? `${a.score}/${a.totalMarks}` : "Submitted"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 p-4 text-center">No student attempts recorded yet.</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Close
                  </button>
                  <Link
                    href="/admin"
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Back to Overview
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
