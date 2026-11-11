import Link from "next/link";
import { ArrowRight, BookOpenCheck, ShieldCheck, Sparkles } from "lucide-react";

export default function HomePage() {
  return <main className="min-h-screen px-5 py-8 md:px-10">
    <header className="mx-auto flex max-w-7xl items-center justify-between">
      <Link href="/" className="flex items-center gap-3 font-bold tracking-tight text-blue-950">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white"><BookOpenCheck size={23}/></span>
        <span className="text-xl">QUIZORA<span className="ml-2 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">ASSESSMENT</span></span>
      </Link>
      <Link href="/login" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">Sign in <ArrowRight className="ml-2 inline" size={16}/></Link>
    </header>
    <section className="mx-auto grid max-w-7xl items-center gap-12 py-20 md:grid-cols-[1.15fr_.85fr] md:py-28">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-medium text-blue-700"><Sparkles size={16}/> Departmental assessment, simplified</span>
        <h1 className="mt-7 max-w-3xl text-5xl font-bold tracking-tight text-blue-950 md:text-7xl">A clearer way to <span className="text-blue-600">test your progress.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">A focused, reliable place to attempt scheduled quizzes, track performance, and review results when they are released.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-xl bg-blue-600 px-6 py-3.5 font-semibold text-white transition hover:bg-blue-700">Open your dashboard <ArrowRight className="ml-2 inline" size={17}/></Link>
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm text-slate-600"><ShieldCheck size={17} className="text-blue-600"/> Secure student access</span>
        </div>
      </div>
      <div className="surface relative overflow-hidden p-6 shadow-xl shadow-blue-950/5 md:p-8">
        <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-blue-100/70 blur-3xl"/>
        <div className="relative flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">Your learning overview</p><h2 className="mt-1 text-2xl font-bold text-blue-950">Stay exam-ready</h2></div><span className="rounded-xl bg-blue-50 p-3 text-blue-600"><BookOpenCheck size={24}/></span></div>
        <div className="relative mt-7 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-blue-50 p-5"><p className="text-sm text-blue-700">Scheduled quizzes</p><p className="mt-3 text-3xl font-bold text-blue-950">On time</p><p className="mt-1 text-xs text-slate-500">See what is coming next</p></div>
          <div className="rounded-2xl bg-slate-50 p-5"><p className="text-sm text-slate-600">Result review</p><p className="mt-3 text-3xl font-bold text-slate-900">Clear</p><p className="mt-1 text-xs text-slate-500">Answers and explanations</p></div>
        </div>
        <div className="relative mt-4 rounded-2xl border border-slate-100 bg-white p-5"><div className="flex items-center justify-between"><p className="font-semibold text-slate-800">Focused assessment</p><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Designed for clarity</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-blue-600"/></div><p className="mt-2 text-xs text-slate-500">Simple navigation · Reliable saving · Fair timing</p></div>
      </div>
    </section>
    <footer className="mx-auto max-w-7xl border-t border-slate-200 py-6 text-sm text-slate-500">Quizora · Department of CSE</footer>
  </main>;
}
