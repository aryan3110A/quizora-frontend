"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  LogOut,
  RefreshCw,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import { api } from "@/lib/api";

type Dashboard = {
  user: { fullName: string; studentId: string; stream: string; role: string; mustChangePassword?: boolean };
  stats: { attempted: number; averageScore: number | null; upcomingCount: number; latestScore: number | null };
  upcoming: Array<{ id: string; title: string; startsAt: string; endsAt: string; durationMinutes: number }>;
  active: Array<{ id: string; title: string; startsAt: string; endsAt: string; durationMinutes: number }>;
  completed?: Array<{
    attemptId: string;
    quizId: string;
    title: string;
    endsAt: string;
    submittedAt: string;
    isReleased: boolean;
    score: number | null;
    totalMarks: number | null;
    percentage: number | null;
  }>;
  notifications: Array<{ id: string; title: string; body: string; publishedAt: string }>;
};

type StudentCardModal = "attempted" | "average" | "upcoming" | "latest" | null;

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeModal, setActiveModal] = useState<StudentCardModal>(null);

  function loadDashboard(silent = false) {
    if (!silent) setRefreshing(true);
    return api<Dashboard>("/student/dashboard")
      .then(setData)
      .catch((e) => {
        if (e?.status === 401) router.replace("/login");
        else setError(e instanceof Error ? e.message : "Dashboard could not be loaded.");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => {
    loadDashboard();
    const timer = setInterval(() => loadDashboard(true), 12000);
    return () => clearInterval(timer);
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3 font-bold text-blue-950">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white">
              <BookOpen size={21} />
            </span>
            <span>
              QUIZORA <span className="block text-xs font-medium text-slate-500">Student Portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadDashboard(false)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Refresh dashboard data"
            >
              <RefreshCw size={15} className={refreshing ? "animate-spin text-blue-600" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition"
            >
              <UserRound size={17} /> Profile
            </Link>
            <Link
              href="/performance"
              className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition sm:flex"
            >
              <ChartNoAxesCombined size={17} /> Performance
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
        {loading && (
          <div className="space-y-4">
            <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-28 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p className="font-semibold">We couldn&apos;t load your dashboard</p>
            <p className="mt-1 text-sm">{error}</p>
            <button
              onClick={() => location.reload()}
              className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && data && (
          <>
            {data.user.mustChangePassword && (
              <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-amber-900">Security notice: Using initial default password</p>
                  <p className="mt-1 text-sm text-amber-800">
                    You are currently logged in with your initial Student ID. You can set your personal password once in your profile.
                  </p>
                </div>
                <Link
                  href="/profile"
                  className="shrink-0 rounded-xl bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-amber-800"
                >
                  Change Password Once
                </Link>
              </div>
            )}

            {/* Profile banner */}
            <section className="flex flex-col justify-between gap-6 rounded-3xl border border-blue-100 bg-gradient-to-r from-white to-blue-50 p-7 shadow-sm md:flex-row md:items-center md:p-9">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    {data.user.stream}
                  </span>
                  <span className="text-sm text-slate-500">ID: {data.user.studentId}</span>
                </div>
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-blue-950 md:text-4xl">
                  Hello, {data.user.fullName}
                </h1>
                <p className="mt-3 max-w-2xl text-slate-600">
                  Your assessment overview, upcoming quizzes, and latest progress—all in one place.
                </p>
              </div>
              <Link
                href="/profile"
                className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white p-4 hover:border-blue-300 transition"
              >
                <span className="rounded-xl bg-blue-50 p-3 text-blue-600">
                  <UserRound size={22} />
                </span>
                <div>
                  <p className="font-semibold text-slate-800">Student Profile</p>
                  <p className="text-sm text-slate-500">
                    {data.user.mustChangePassword ? "Update password (1-time)" : "Password set & locked"}
                  </p>
                </div>
              </Link>
            </section>

            {/* 4 Clickable Metric Cards */}
            <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  id: "attempted" as StudentCardModal,
                  label: "Quizzes attempted",
                  value: data.stats.attempted,
                  icon: BookOpen,
                  sub: "Completed assessments",
                  hint: "Click to view submissions"
                },
                {
                  id: "average" as StudentCardModal,
                  label: "Average score",
                  value: data.stats.averageScore === null ? "—" : `${data.stats.averageScore}%`,
                  icon: ChartNoAxesCombined,
                  sub: "Released results only",
                  hint: "Click to view scoring info"
                },
                {
                  id: "upcoming" as StudentCardModal,
                  label: "Upcoming quizzes",
                  value: data.stats.upcomingCount,
                  icon: CalendarDays,
                  sub: "Scheduled for your stream",
                  hint: "Click to check timetable"
                },
                {
                  id: "latest" as StudentCardModal,
                  label: "Latest score",
                  value: data.stats.latestScore === null ? "—" : `${data.stats.latestScore}%`,
                  icon: CheckCircle2,
                  sub: "Most recent released result",
                  hint: "Click to view result details"
                }
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setActiveModal(item.id)}
                  className="text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-400 hover:shadow-md group focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-600 group-hover:text-blue-700 transition">
                      {item.label}
                    </p>
                    <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                      <item.icon size={20} />
                    </span>
                  </div>
                  <p className="mt-4 text-3xl font-bold tracking-tight text-blue-950">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.sub}</p>
                  <p className="mt-2 text-xs text-blue-600 flex items-center gap-1 font-medium">
                    <span>{item.hint}</span>
                    <ArrowRight size={12} className="transition-transform group-hover:translate-x-1" />
                  </p>
                </button>
              ))}
            </section>

            {/* Row 1: Available Quizzes (60%) and Upcoming Schedule (40%) */}
            <section className="mt-10 grid gap-7 lg:grid-cols-[1.5fr_1fr]">
              {/* Left Column (60%): Available Quizzes */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-950">Available quizzes</h2>
                    <p className="mt-1 text-sm text-slate-500">Quizzes open for your stream right now</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {data.active.length} available
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {data.active.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-9 text-center">
                      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                        <BookOpen size={23} />
                      </span>
                      <h3 className="mt-4 font-semibold text-slate-800">No active quizzes right now</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Published quizzes will appear here when their scheduled start time arrives.
                      </p>
                    </div>
                  ) : (
                    data.active.map((q) => (
                      <article
                        key={q.id}
                        className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center shadow-sm"
                      >
                        <div>
                          <h3 className="font-semibold text-slate-900">{q.title}</h3>
                          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                            <Clock3 size={15} /> {q.durationMinutes} minutes · Ends: {new Date(q.endsAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <Link
                          href={`/quiz/${q.id}`}
                          className="rounded-xl bg-blue-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 transition shadow-sm"
                        >
                          Attempt quiz
                        </Link>
                      </article>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column (40%): Upcoming Schedule */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-blue-950">Upcoming schedule</h2>
                    <p className="mt-1 text-sm text-slate-500">Plan your preparation</p>
                  </div>
                  <CalendarDays className="text-blue-600" />
                </div>

                <div className="mt-4 space-y-3">
                  {data.upcoming.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-9 text-center text-sm text-slate-500">
                      No upcoming quizzes scheduled yet.
                    </div>
                  ) : (
                    data.upcoming.map((q) => (
                      <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                        <p className="font-semibold text-slate-800">{q.title}</p>
                        <p className="mt-2 text-sm text-slate-500">{new Date(q.startsAt).toLocaleString()}</p>
                        <p className="mt-1 text-xs text-slate-400">{q.durationMinutes} minutes assessment</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* Row 2: Full Width Notifications (100% width) */}
            <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                    <Bell size={20} />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-blue-950">Department Notifications & Announcements</h2>
                    <p className="mt-0.5 text-sm text-slate-500">Official schedule updates from your academic stream</p>
                  </div>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {data.notifications.length} {data.notifications.length === 1 ? "notification" : "notifications"}
                </span>
              </div>

              <div className="mt-6 space-y-4">
                {data.notifications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
                    You&apos;re all caught up. No new announcements at this time.
                  </div>
                ) : (
                  data.notifications.map((n) => (
                    <article
                      key={n.id}
                      className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/50 p-5 shadow-xs hover:border-blue-200 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <h3 className="font-bold text-slate-900 text-base">{n.title}</h3>
                        <span className="text-xs text-slate-400 font-medium">
                          {new Date(n.publishedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                    </article>
                  ))
                )}
              </div>
            </section>

            {/* Row 3: Attempted Assessments (Full Width 100%) */}
            {data.completed && data.completed.length > 0 && (
              <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-xl font-bold text-blue-950">Attempted assessments</h2>
                    <p className="mt-0.5 text-sm text-slate-500">Your completed assessments & released results</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    {data.completed.length} completed
                  </span>
                </div>
                <div className="mt-6 space-y-4">
                  {data.completed.map((c) => (
                    <article
                      key={c.attemptId}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center shadow-xs hover:border-blue-200 transition"
                    >
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{c.title}</h3>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>Submitted: {new Date(c.submittedAt).toLocaleTimeString()}</span>
                          {c.isReleased ? (
                            <span className="rounded-md bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 border border-emerald-200">
                              Score: {c.score} / {c.totalMarks} ({c.percentage}%)
                            </span>
                          ) : (
                            <span className="rounded-md bg-amber-50 px-2.5 py-1 font-medium text-amber-800 border border-amber-200">
                              Results pending · Release at {new Date(c.endsAt).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/results/${c.attemptId}`}
                        className={`rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${
                          c.isReleased
                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                            : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {c.isReleased ? "View Solutions & Marks" : "Check Status"}
                      </Link>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="mt-12 border-t border-slate-200 py-6 text-sm text-slate-500 text-center">
          Quizora · Departmental Assessment Platform
        </footer>
      </div>

      {/* Info Modals for Student Metric Cards */}
      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              aria-label="Close"
            >
              <X size={18} />
            </button>

            {/* Modal: Attempted Quizzes */}
            {activeModal === "attempted" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-200">
                    <BookOpen size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Completed Assessments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Summary of quizzes you have submitted.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Submissions Recorded</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{data?.stats.attempted} Completed</p>
                </div>

                <div className="mt-4 max-h-56 overflow-y-auto space-y-2.5">
                  {data?.completed && data.completed.length > 0 ? (
                    data.completed.map((c) => (
                      <div key={c.attemptId} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs bg-white">
                        <div>
                          <p className="font-semibold text-slate-900">{c.title}</p>
                          <p className="text-slate-400 mt-0.5">Submitted at {new Date(c.submittedAt).toLocaleTimeString()}</p>
                        </div>
                        {c.isReleased ? (
                          <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                            {c.score}/{c.totalMarks} ({c.percentage}%)
                          </span>
                        ) : (
                          <span className="font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Release pending
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500 p-4 text-center">No assessments completed yet.</p>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}

            {/* Modal: Average Score */}
            {activeModal === "average" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                    <ChartNoAxesCombined size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Average Performance</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      How your overall grade average is computed.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-center">
                  <p className="text-xs font-semibold text-indigo-700">Cumulative Released Average</p>
                  <p className="mt-1 text-3xl font-bold text-indigo-950">
                    {data?.stats?.averageScore == null ? "—" : `${data?.stats?.averageScore}%`}
                  </p>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
                  <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" /> Delayed Result Release Policy
                  </p>
                  <p className="leading-relaxed">
                    Average score is calculated strictly from assessments whose scheduled closing window has ended and results have been released. Pending assessments are not included until their scheduled deadline passes.
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* Modal: Upcoming Quizzes */}
            {activeModal === "upcoming" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-200">
                    <CalendarDays size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Upcoming Assessments</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Assessments scheduled for {data?.user?.stream ?? "your stream"}.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-amber-900">Scheduled on Timetable</span>
                    <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                      {data?.stats?.upcomingCount ?? 0} Upcoming
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-amber-800 leading-relaxed">
                    When an assessment reaches its scheduled start time, it automatically moves to &quot;Available quizzes&quot; and you can click Attempt quiz.
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Got it
                  </button>
                </div>
              </div>
            )}

            {/* Modal: Latest Score */}
            {activeModal === "latest" && (
              <div>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <CheckCircle2 size={24} />
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Latest Released Result</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Your most recent graded assessment.
                    </p>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <p className="text-xs font-semibold text-emerald-700">Most Recent Score</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-950">
                    {data?.stats?.latestScore == null ? "No released results yet" : `${data.stats.latestScore}%`}
                  </p>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setActiveModal(null)}
                    className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
