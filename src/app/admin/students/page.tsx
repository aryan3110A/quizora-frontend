"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, CheckCircle2, RotateCcw, AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";

type Student = {
  id: string;
  studentId: string;
  fullName: string;
  stream: string;
  isActive: boolean;
  mustChangePassword?: boolean;
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmStudent, setConfirmStudent] = useState<Student | null>(null);

  function loadStudents() {
    api<{ students: Student[] }>("/admin/students")
      .then((x) => setStudents(x.students))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load students."));
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function executeResetPassword(student: Student) {
    setResettingId(student.id);
    setMessage("");
    setError("");
    try {
      const res = await api<{ ok: boolean; message: string }>(`/admin/students/${student.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setMessage(res.message);
      loadStudents();
    } catch (err: any) {
      setError(err?.message || "Failed to reset password.");
    } finally {
      setResettingId(null);
      setConfirmStudent(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f8ff] p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
          <ArrowLeft size={16} /> Admin dashboard
        </Link>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-blue-950">Student Management</h1>
            <p className="mt-1 text-slate-500">Registered students, stream assignments, and password reset control.</p>
          </div>
          <span className="rounded-full bg-blue-100 px-3.5 py-1 text-sm font-semibold text-blue-800">
            {students.length} Students Registered
          </span>
        </div>

        {message && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="p-3">Student ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Stream</th>
                <th className="p-3">Status</th>
                <th className="p-3">Password Policy</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-blue-950">{s.studentId}</td>
                  <td className="p-3 text-slate-800">{s.fullName}</td>
                  <td className="p-3">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {s.stream}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-block h-2 w-2 rounded-full mr-2 ${s.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                    <span className="text-slate-600">{s.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td className="p-3">
                    {s.mustChangePassword ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full">
                        Initial (Change Allowed)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Custom Set (Locked)
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setConfirmStudent(s)}
                      disabled={resettingId === s.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50"
                      title="Reset password to Student ID and allow one new change"
                    >
                      <RotateCcw size={13} />
                      {resettingId === s.id ? "Resetting..." : "Reset to ID"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!students.length && !error && (
            <p className="p-6 text-center text-slate-500">No students found.</p>
          )}
        </div>
      </div>

      {confirmStudent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              onClick={() => !resettingId && setConfirmStudent(null)}
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
                <h3 className="text-lg font-bold text-slate-900">Reset Student Password?</h3>
                <p className="mt-1 text-sm text-slate-500">
                  This will reset the password for <strong>{confirmStudent.fullName}</strong> (<code>{confirmStudent.studentId}</code>) back to their initial Student ID and unlock a one-time password change.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmStudent(null)}
                disabled={Boolean(resettingId)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeResetPassword(confirmStudent)}
                disabled={Boolean(resettingId)}
                className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition disabled:opacity-60 flex items-center gap-2"
              >
                <RotateCcw size={15} />
                {resettingId ? "Resetting…" : "Confirm Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
