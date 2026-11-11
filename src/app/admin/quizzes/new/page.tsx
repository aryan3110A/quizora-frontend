"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewQuizPage(){
 const router=useRouter();const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [startsAt,setStartsAt]=useState("");const [endsAt,setEndsAt]=useState("");const [duration,setDuration]=useState("30");const [marks,setMarks]=useState("1");const [streamIds,setStreamIds]=useState("CSE");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{const q=await api<{id:string}>("/admin/quizzes",{method:"POST",body:JSON.stringify({title,description,startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString(),durationMinutes:Number(duration),defaultMarks:Number(marks),streamCodes:streamIds.split(",").map(s=>s.trim()).filter(Boolean)})});router.push(`/admin/import?quizId=${q.id}`);}catch(e){setError(e instanceof Error?e.message:"Quiz could not be created.");}finally{setBusy(false);}}
 return <main className="min-h-screen bg-[#f5f8ff] px-5 py-8"><div className="mx-auto max-w-3xl"><Link href="/admin" className="text-sm font-semibold text-blue-700">← Admin dashboard</Link><h1 className="mt-5 text-3xl font-bold text-blue-950">Create a quiz</h1><p className="mt-2 text-slate-500">Set the schedule and eligibility, then import your questions.</p><form onSubmit={submit} className="mt-7 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
 {[
  {label:"Quiz title",value:title,set:setTitle,placeholder:"e.g. C Programming Assessment",type:"text"},
  {label:"Description and topics",value:description,set:setDescription,placeholder:"Topics covered in this assessment",type:"text"}
 ].map(f=><div key={f.label}><label className="mb-2 block text-sm font-semibold text-slate-700">{f.label}</label><input required value={f.value} onChange={e=>f.set(e.target.value)} placeholder={f.placeholder} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></div>)}
 <div className="grid gap-5 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold text-slate-700">Start date and time</label><input required type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3"/></div><div><label className="mb-2 block text-sm font-semibold text-slate-700">Closing date and time</label><input required type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-3"/></div></div>
 <div className="grid gap-5 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-semibold text-slate-700">Duration (minutes)</label><input required min="1" max="360" type="number" value={duration} onChange={e=>setDuration(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div><div><label className="mb-2 block text-sm font-semibold text-slate-700">Default marks per question</label><input required min="0.1" type="number" step="0.1" value={marks} onChange={e=>setMarks(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div></div>
 <div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">Eligible stream codes</label>
  <div className="mb-2.5 flex flex-wrap gap-2">
    {["MCE", "CSE", "DS", "CYBER", "CS"].map(code => {
      const selected = streamIds.split(",").map(s => s.trim()).includes(code);
      return (
        <button
          key={code}
          type="button"
          onClick={() => {
            const current = streamIds.split(",").map(s => s.trim()).filter(Boolean);
            if (selected) {
              setStreamIds(current.filter(c => c !== code).join(", "));
            } else {
              setStreamIds([...current, code].join(", "));
            }
          }}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
            selected ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
          }`}
        >
          {code === "MCE" ? "★ MCE (Nirma Students)" : code}
        </button>
      );
    })}
    <button
      type="button"
      onClick={() => setStreamIds("MCE, CSE, DS, CYBER, CS")}
      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
    >
      Select All Streams
    </button>
  </div>
  <input required value={streamIds} onChange={e=>setStreamIds(e.target.value)} placeholder="MCE, CSE, DS, CYBER, CS" className="w-full rounded-xl border border-slate-300 px-4 py-3"/>
  <p className="mt-1 text-xs text-slate-500">Comma-separated stream codes. Make sure to include <strong>MCE</strong> for your 26MCE001-032 students.</p>
 </div>
 {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<button disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy?"Creating…":"Create draft and import questions"}</button>
 </form></div></main>
}
