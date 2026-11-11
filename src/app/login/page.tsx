"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpenCheck, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const result = await api<{ user: { role: string } }>("/auth/login", {
        method: "POST", body: JSON.stringify({ studentId: studentId.trim(), password })
      });
      router.push(result.user.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally { setLoading(false); }
  }

  return <main className="grid min-h-screen bg-white md:grid-cols-2">
    <section className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 to-blue-950 p-12 text-white md:flex">
      <Link href="/" className="flex items-center gap-3 text-xl font-bold"><BookOpenCheck/> QUIZORA</Link>
      <div><p className="text-sm font-semibold uppercase tracking-[.2em] text-blue-200">Departmental assessment</p><h1 className="mt-5 max-w-lg text-5xl font-bold leading-tight">Your next milestone starts with one question.</h1><p className="mt-5 max-w-md leading-7 text-blue-100">Sign in to view your schedule, attempt quizzes, and follow your progress.</p></div>
      <p className="text-sm text-blue-200">Quizora · Secure student access</p>
    </section>
    <section className="flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-700"><BookOpenCheck size={18}/> Quizora</Link>
        <h2 className="mt-8 text-3xl font-bold tracking-tight text-blue-950">Welcome back</h2>
        <p className="mt-2 text-slate-500">Sign in with your official student ID.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div><label htmlFor="studentId" className="mb-2 block text-sm font-semibold text-slate-700">Student ID</label><input id="studentId" autoComplete="username" required value={studentId} onChange={e=>setStudentId(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Enter your official ID"/></div>
          <div><label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label><div className="relative"><input id="password" type={showPassword?"text":"password"} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 pr-12 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Enter your password"/><button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?"Hide password":"Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{loading&&<LoaderCircle className="animate-spin" size={18}/>}Sign in</button>
        </form>
        <p className="mt-6 text-sm text-slate-500">Need access? Contact your department administrator.</p>
      </div>
    </section>
  </main>;
}
