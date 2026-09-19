"use client";

import { Bot, Check, Mic, Pencil, Send, Sparkles, Square, Volume2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";

type VoiceState = "IDLE" | "LISTENING" | "TRANSCRIBING" | "UNDERSTANDING" | "PREPARING" | "READY" | "EXECUTING" | "COMPLETED" | "ERROR";
type Proposal = { id: number; actionType: string; previewJson: string; payloadJson: string; conversationId: number };
type Answer = { conversationId: number; answer: string; responseType: string; data?: Record<string, unknown>[]; drillDown?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null; onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null };

const stateLabel: Record<VoiceState, string> = { IDLE: "جاهز", LISTENING: "أستمع…", TRANSCRIBING: "أحوّل الصوت…", UNDERSTANDING: "أفهم الطلب…", PREPARING: "أجهّز المعاينة…", READY: "جاهز للمراجعة", EXECUTING: "أنفّذ بعد اعتمادك…", COMPLETED: "اكتمل", ERROR: "تحتاج مراجعة" };
const labels: Record<string, string> = { title: "الإجراء", customer: "العميل", material: "المادة", city: "المدينة", telephone: "الهاتف", quantity: "الكمية", unitPrice: "سعر الوحدة", subtotal: "قبل الضريبة", vat: "الضريبة", total: "الإجمالي", ownership: "ملكية المخزون", nextSteps: "المسار التشغيلي", effect: "الأثر" };

export default function NetajOne() {
  const pathname = usePathname(), [open, setOpen] = useState(false), [mode, setMode] = useState<"ASK" | "ACTION">("ASK"), [value, setValue] = useState(""), [state, setState] = useState<VoiceState>("IDLE"), [error, setError] = useState(""), [answer, setAnswer] = useState<Answer | null>(null), [proposal, setProposal] = useState<Proposal | null>(null), [conversationId, setConversationId] = useState<number>(), recognitionRef = useRef<Recognition | null>(null);
  const preview = useMemo(() => { try { return proposal ? JSON.parse(proposal.previewJson) as Record<string, unknown> : null; } catch { return null; } }, [proposal]);

  async function send(event?: FormEvent) {
    event?.preventDefault(); if (!value.trim()) return;
    setError(""); setAnswer(null); setProposal(null); setState("UNDERSTANDING");
    try {
      setState(mode === "ACTION" ? "PREPARING" : "UNDERSTANDING");
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode === "ACTION" ? { action: "INTERPRET", command: value, conversationId, pageContext: pathname } : { action: "ASK", question: value, conversationId, pageContext: pathname }) }), body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (mode === "ACTION") { setProposal(body); setConversationId(body.conversationId); setState("READY"); }
      else { setAnswer(body); setConversationId(body.conversationId); setState("COMPLETED"); }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر فهم الطلب"); setState("ERROR"); }
  }

  function listen() {
    const Constructor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Constructor) { setError("التعرف الصوتي غير متاح في هذا المتصفح. يمكنك كتابة الطلب دائمًا."); setState("ERROR"); return; }
    if (state === "LISTENING") { recognitionRef.current?.stop(); return; }
    const recognition = new Constructor(); recognitionRef.current = recognition; recognition.lang = "ar-SA"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { setOpen(true); setError(""); setState("LISTENING"); };
    recognition.onresult = (event) => { setState("TRANSCRIBING"); setValue(Array.from(event.results).map((result) => result[0].transcript).join(" ")); };
    recognition.onerror = () => { setError("تعذر التقاط الصوت. جرّب مرة أخرى أو استخدم النص."); setState("ERROR"); };
    recognition.onend = () => setState((current) => current === "LISTENING" || current === "TRANSCRIBING" ? "IDLE" : current);
    recognition.start();
  }

  async function proposalAction(action: "CONFIRM" | "CANCEL") {
    if (!proposal) return; setError(""); setState(action === "CONFIRM" ? "EXECUTING" : "IDLE");
    try { const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: proposal.id }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); setProposal(null); if (action === "CONFIRM") { setAnswer({ conversationId: proposal.conversationId, answer: "تم تنفيذ الإجراء المعتمد وتسجيله في سجل التدقيق.", responseType: "TEXT" }); setState("COMPLETED"); } else setState("IDLE"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "تعذر تنفيذ الإجراء"); setState("ERROR"); }
  }

  async function editProposal() { await proposalAction("CANCEL"); setState("IDLE"); }
  function speak() { if (!answer || !("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(answer.answer); utterance.lang = "ar-SA"; window.speechSynthesis.speak(utterance); }

  return <>
    <button aria-label="فتح NETAJ ONE" onClick={() => setOpen(true)} className="netaj-one-trigger"><span><Mic size={22}/></span><b>NETAJ ONE</b><small>SAY IT ONCE</small></button>
    {open && <div className="netaj-one-layer" role="dialog" aria-modal="true" aria-label="NETAJ ONE"><button aria-label="إغلاق NETAJ ONE" className="netaj-one-backdrop" onClick={() => setOpen(false)}/><section className="netaj-one-panel">
      <header><div className="netaj-one-orb"><Sparkles size={22}/></div><div><b>NETAJ ONE</b><p>SAY IT ONCE → REVIEW → APPROVE</p></div><button aria-label="إغلاق" onClick={() => setOpen(false)}><X/></button></header>
      <div className="netaj-one-tabs"><button className={mode === "ASK" ? "is-active" : ""} onClick={() => { setMode("ASK"); setProposal(null); }}>اسأل أعمالك</button><button className={mode === "ACTION" ? "is-active" : ""} onClick={() => { setMode("ACTION"); setAnswer(null); }}>نفّذ بعد المراجعة</button></div>
      <div className={`netaj-one-state is-${state.toLowerCase()}`}><i/>{stateLabel[state]}<span>{pathname}</span></div>
      <form onSubmit={send}><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === "ACTION" ? "مثال: أضف عميل شركة إعمار في الرياض ورقم الهاتف…" : "اسأل: لماذا انخفض الربح؟ كم السيولة؟ من المتأخر أكثر من 60 يومًا؟"}/><div className="netaj-one-compose"><button type="button" aria-label="بدء أو إيقاف الصوت" onClick={listen} className={state === "LISTENING" ? "is-listening" : ""}>{state === "LISTENING" ? <Square size={18}/> : <Mic size={20}/>}</button><button disabled={!value.trim() || ["UNDERSTANDING", "PREPARING", "EXECUTING"].includes(state)}><Send size={18}/>{mode === "ACTION" ? "جهّز المعاينة" : "اسأل"}</button></div></form>
      {error && <div className="netaj-one-error">{error}</div>}
      {answer && <div className="netaj-one-answer"><div><Bot size={19}/><b>{answer.answer}</b></div><button aria-label="قراءة صوتية" onClick={speak}><Volume2 size={18}/></button>{answer.data?.length ? <div className="netaj-one-mini-grid">{answer.data.slice(0, 4).map((row, index) => <div key={index}>{Object.entries(row).filter(([key]) => key !== "href").slice(0, 2).map(([key, item]) => <p key={key}><span>{key}</span><b>{typeof item === "number" ? item.toLocaleString("ar-SA", { maximumFractionDigits: 2 }) : String(item ?? "—")}</b></p>)}</div>)}</div> : null}</div>}
      {proposal && preview && <div className="netaj-one-preview"><div className="netaj-one-preview-title"><Check size={19}/><div><b>{String(preview.title ?? "معاينة الإجراء")}</b><p>لم يتم تغيير أي بيانات بعد.</p></div></div><dl>{Object.entries(preview).filter(([key]) => key !== "title").map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{typeof item === "number" ? item.toLocaleString("ar-SA", { maximumFractionDigits: 2 }) : String(item ?? "—")}</dd></div>)}</dl><div className="netaj-one-review-actions"><button onClick={() => void proposalAction("CONFIRM")}><Check size={17}/>اعتماد وتنفيذ</button><button onClick={() => void editProposal()}><Pencil size={17}/>تعديل الطلب</button><button onClick={() => void proposalAction("CANCEL")}><X size={17}/>إلغاء</button></div></div>}
      <footer>كل قراءة وصلاحية وتنفيذ مقيد بالشركة والمستخدم والوحدات، ويُسجل في Audit Trail.</footer>
    </section></div>}
  </>;
}
