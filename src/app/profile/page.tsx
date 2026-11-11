"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChartNoAxesCombined,
  KeyRound,
  Lock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowLeft
} from "lucide-react";
import { api } from "@/lib/api";

type MeResponse = {
  user: {
    id: string;
    studentId: string;
    fullName: string;
    role: string;
    stream: string | null;
    mustChangePassword: boolean;
  };
};

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<MeResponse["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<MeResponse>("/auth/me")
      .then((res) => {
        if (res.user.role !== "STUDENT") {
          router.replace("/admin");
        } else {
          setUser(res.user);
        }
      })
      .catch((e) => {
        if (e?.status === 401) router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setStatusMessage(null);

    if (newPassword.length < 8) {
      setStatusMessage({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatusMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setStatusMessage({ type: "success", text: res.message || "Password updated. Redirecting to login..." });
      setTimeout(() => {
        router.replace("/login");
      }, 2000);
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err?.message || "Failed to change password. Please check your current password."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff]">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/dashboard" className="flex items-center gap-3 font-bold text-blue-950">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white">
              <BookOpen size={21} />
            </span>
            <span>
              QUIZORA <span className="block text-xs font-medium text-slate-500">Student Profile</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
            >
              Dashboard
            </Link>
            <Link
              href="/performance"
              className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-700 sm:flex"
            >
              <ChartNoAxesCombined size={17} /> Performance
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-8 md:px-8 md:py-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        {loading && (
          <div className="mt-6 space-y-4">
            <div className="h-44 animate-pulse rounded-3xl bg-slate-200" />
            <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
          </div>
        )}

        {!loading && user && (
          <div className="mt-6 space-y-7">
            {/* Account Details Card */}
            <section className="rounded-3xl border border-blue-100 bg-white p-7 shadow-sm md:p-9">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                    <User size={32} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-blue-950 md:text-3xl">{user.fullName}</h1>
                    <p className="mt-1 text-sm font-medium text-slate-500">Student ID: {user.studentId}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800">
                    Stream: {user.stream || "MCE"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                    Official Student Account
                  </span>
                </div>
              </div>

              <div className="mt-8 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Institutional Email / Login ID</p>
                  <p className="mt-1 font-semibold text-slate-800">{user.studentId}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Password Policy Status</p>
                  <div className="mt-1 flex items-center gap-2">
                    {user.mustChangePassword ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <ShieldAlert size={14} /> Initial password (one-time change available)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        <ShieldCheck size={14} /> Custom password set (change locked)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Password Management Card */}
            <section className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm md:p-9">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                  <KeyRound size={22} />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-blue-950">Security & Password</h2>
                  <p className="text-sm text-slate-500">Student password policy enforcement</p>
                </div>
              </div>

              {/* Status Message */}
              {statusMessage && (
                <div
                  className={`mt-6 flex items-start gap-3 rounded-2xl p-4 text-sm ${
                    statusMessage.type === "success"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {statusMessage.type === "success" ? (
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  )}
                  <p>{statusMessage.text}</p>
                </div>
              )}

              {user.mustChangePassword ? (
                /* One-time change allowed */
                <div className="mt-6">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
                    <p className="font-semibold">One-Time Initial Password Update</p>
                    <p className="mt-1 text-blue-700">
                      You are currently using your initial setup password (your Student ID). You can set your personal password here <strong>once</strong>. After this update, further password changes or resets must be requested through your department administrator.
                    </p>
                  </div>

                  <form onSubmit={handlePasswordChange} className="mt-6 space-y-4 max-w-lg">
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Current Initial Password
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrent ? "text" : "password"}
                          required
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter your current password"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrent((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        New Password (minimum 8 characters)
                      </label>
                      <div className="relative">
                        <input
                          type={showNew ? "text" : "password"}
                          required
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Choose a strong new password"
                          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-2 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {submitting ? "Updating Password..." : "Set New Password (One-Time)"}
                    </button>
                  </form>
                </div>
              ) : (
                /* Already changed once - locked per policy */
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-200 text-slate-600">
                      <Lock size={20} />
                    </span>
                    <div>
                      <h3 className="font-semibold text-slate-800">Password Change Locked</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        You have already updated your password once. Per institutional exam security guidelines, students are permitted to change their initial password only once.
                      </p>
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Need to change or forgot your password?</p>
                        <p className="mt-1 text-slate-500">
                          Please contact your department administrator. The administrator can verify your identity and reset your password to your Student ID, allowing you to set a new password.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
