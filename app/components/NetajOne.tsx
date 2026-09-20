"use client";

import { Bot, Check, Mic, Pencil, Send, Sparkles, Square, Volume2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type VoiceState = "IDLE" | "LISTENING" | "TRANSCRIBING" | "UNDERSTANDING" | "PREPARING" | "READY" | "EXECUTING" | "COMPLETED" | "ERROR";
type Proposal = { id: number; actionType: string; previewJson: string; payloadJson: string; conversationId: number };
type Answer = { conversationId: number; answer: string; responseType: string; data?: Record<string, unknown>[]; drillDown?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onstart: (() => void) | null; onend: (() => void) | null; onerror: (() => void) | null; onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null };

const stateLabelAr: Record<VoiceState, string> = { IDLE: "جاهز", LISTENING: "أستمع…", TRANSCRIBING: "أحوّل الصوت…", UNDERSTANDING: "أفهم الطلب…", PREPARING: "أجهّز المعاينة…", READY: "جاهز للمراجعة", EXECUTING: "أنفّذ بعد اعتمادك…", COMPLETED: "اكتمل", ERROR: "تحتاج مراجعة" };
const stateLabelEn: Record<VoiceState, string> = { IDLE: "Ready", LISTENING: "Listening…", TRANSCRIBING: "Transcribing…", UNDERSTANDING: "Understanding…", PREPARING: "Preparing preview…", READY: "Ready for review", EXECUTING: "Executing after approval…", COMPLETED: "Completed", ERROR: "Needs review" };
const labels: Record<string, string> = { title: "الإجراء", customer: "العميل / المورد", material: "المادة", city: "المدينة", telephone: "الهاتف", quantity: "الكمية", unitPrice: "سعر الوحدة", subtotal: "قبل الضريبة", vat: "الضريبة", total: "الإجمالي", amount: "المبلغ", bank: "البنك / الصندوق", ownership: "ملكية المخزون", nextSteps: "المسار التشغيلي", effect: "الأثر" };
const startersAr = ["لخّص أداء هذا الشهر", "من المتأخر أكثر من 60 يومًا؟", "لماذا تغيّر صافي الربح؟"];
const startersEn = ["Summarize this month's performance", "Who is overdue by more than 60 days?", "Why did net profit change?"];

export default function NetajOne() {
  const pathname = usePathname(), [open, setOpen] = useState(false), [mode, setMode] = useState<"ASK" | "ACTION">("ASK"), [value, setValue] = useState(""), [state, setState] = useState<VoiceState>("IDLE"), [error, setError] = useState(""), [answer, setAnswer] = useState<Answer | null>(null), [proposal, setProposal] = useState<Proposal | null>(null), [conversationId, setConversationId] = useState<number>(), recognitionRef = useRef<Recognition | null>(null);
  const isEnglish = typeof window !== "undefined" && window.localStorage.getItem("netaj-language") === "en";
  const isDashboard = pathname === "/";
  const stateLabel = isEnglish ? stateLabelEn : stateLabelAr;
  const starters = isEnglish ? startersEn : startersAr;
  const copy = isEnglish ? {subtitle:"SAY IT ONCE → REVIEW → APPROVE",ask:"Ask your business",action:"Execute after review",questions:"Suggested questions",actionPlaceholder:"Example: Add a customer…",askPlaceholder:"Ask: Why did profit drop? How much liquidity?",askButton:"Ask",previewButton:"Prepare preview",close:"Close",voice:"Start or stop voice",preview:"Action preview",noData:"No data changed yet.",approve:"Approve & execute",edit:"Edit request",cancel:"Cancel",audit:"Every reading, permission and execution is scoped to your company and user and recorded in the audit trail.",voiceUnavailable:"Voice recognition is not available in this browser. You can always type your request.",voiceError:"Unable to capture voice. Try again or use text.",completed:"The approved action was executed and recorded in the audit trail."} : {subtitle:"SAY IT ONCE → REVIEW → APPROVE",ask:"اسأل أعمالك",action:"نفّذ بعد المراجعة",questions:"أسئلة مقترحة",actionPlaceholder:"مثال: أضف عميل شركة إعمار في الرياض ورقم الهاتف…",askPlaceholder:"اسأل: لماذا انخفض الربح؟ كم السيولة؟ من المتأخر أكثر من 60 يومًا؟",askButton:"اسأل",previewButton:"جهّز المعاينة",close:"إغلاق",voice:"بدء أو إيقاف الصوت",preview:"معاينة الإجراء",noData:"لم يتم تغيير أي بيانات بعد.",approve:"اعتماد وتنفيذ",edit:"تعديل الطلب",cancel:"إلغاء",audit:"كل قراءة وصلاحية وتنفيذ مقيد بالشركة والمستخدم والوحدات، ويُسجل في Audit Trail.",voiceUnavailable:"التعرف الصوتي غير متاح في هذا المتصفح. يمكنك كتابة الطلب دائمًا.",voiceError:"تعذر التقاط الصوت. جرّب مرة أخرى أو استخدم النص.",completed:"تم تنفيذ الإجراء المعتمد وتسجيله في سجل التدقيق."};
  useEffect(() => { const openAssistant = () => setOpen(true); window.addEventListener("netaj-one-open", openAssistant); return () => window.removeEventListener("netaj-one-open", openAssistant); }, []);
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : (isEnglish ? "Unable to understand the request" : "تعذر فهم الطلب")); setState("ERROR"); }
  }

  function listen() {
    const Constructor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Constructor) { setError(copy.voiceUnavailable); setState("ERROR"); return; }
    if (state === "LISTENING") { recognitionRef.current?.stop(); return; }
    const recognition = new Constructor(); recognitionRef.current = recognition; recognition.lang = window.localStorage.getItem("netaj-language") === "en" ? "en-US" : "ar-SA"; recognition.interimResults = true; recognition.continuous = false;
    recognition.onstart = () => { setOpen(true); setError(""); setState("LISTENING"); };
    recognition.onresult = (event) => { setState("TRANSCRIBING"); setValue(Array.from(event.results).map((result) => result[0].transcript).join(" ")); };
    recognition.onerror = () => { setError(copy.voiceError); setState("ERROR"); };
    recognition.onend = () => setState((current) => current === "LISTENING" || current === "TRANSCRIBING" ? "IDLE" : current);
    recognition.start();
  }

  async function proposalAction(action: "CONFIRM" | "CANCEL") {
    if (!proposal) return; setError(""); setState(action === "CONFIRM" ? "EXECUTING" : "IDLE");
    try { const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: proposal.id }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); setProposal(null); if (action === "CONFIRM") { setAnswer({ conversationId: proposal.conversationId, answer: copy.completed, responseType: "TEXT" }); setState("COMPLETED"); } else setState("IDLE"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : (isEnglish ? "Unable to execute the action" : "تعذر تنفيذ الإجراء")); setState("ERROR"); }
  }

  async function editProposal() { await proposalAction("CANCEL"); setState("IDLE"); }
  function speak() { if (!answer || !("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(answer.answer); utterance.lang = window.localStorage.getItem("netaj-language") === "en" ? "en-US" : "ar-SA"; window.speechSynthesis.speak(utterance); }

  return <>
    {!isDashboard && <button aria-label={isEnglish ? "Open NETAJ ONE" : "فتح NETAJ ONE"} onClick={() => setOpen(true)} className="netaj-one-trigger"><span><Mic size={22}/></span><b>NETAJ ONE</b><small>{isEnglish ? "SMART ASSISTANT" : "المساعد الذكي"}</small></button>}
    {open && <div className="netaj-one-layer" role="dialog" aria-modal="true" aria-label="NETAJ ONE"><button aria-label="إغلاق NETAJ ONE" className="netaj-one-backdrop" onClick={() => setOpen(false)}/><section className="netaj-one-panel">
      <header><div className="netaj-one-orb"><Sparkles size={22}/></div><div><b>NETAJ ONE</b><p>{copy.subtitle}</p></div><button aria-label={copy.close} onClick={() => setOpen(false)}><X/></button></header>
      <div className="netaj-one-tabs"><button className={mode === "ASK" ? "is-active" : ""} onClick={() => { setMode("ASK"); setProposal(null); }}>{copy.ask}</button><button className={mode === "ACTION" ? "is-active" : ""} onClick={() => { setMode("ACTION"); setAnswer(null); }}>{copy.action}</button></div>
      <div className={`netaj-one-state is-${state.toLowerCase()}`}><i/>{stateLabel[state]}<span>{pathname}</span></div>
      {mode === "ASK" && !answer && <div className="netaj-one-starters" aria-label={copy.questions}>{starters.map(prompt => <button key={prompt} type="button" onClick={() => setValue(prompt)}>{prompt}</button>)}</div>}
      <form onSubmit={send}><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder={mode === "ACTION" ? copy.actionPlaceholder : copy.askPlaceholder}/><div className="netaj-one-compose"><button type="button" aria-label={copy.voice} onClick={listen} className={state === "LISTENING" ? "is-listening" : ""}>{state === "LISTENING" ? <Square size={18}/> : <Mic size={20}/>}</button><button disabled={!value.trim() || ["UNDERSTANDING", "PREPARING", "EXECUTING"].includes(state)}><Send size={18}/>{mode === "ACTION" ? copy.previewButton : copy.askButton}</button></div></form>
      {error && <div className="netaj-one-error">{error}</div>}
      {answer && <div className="netaj-one-answer"><div><Bot size={19}/><b>{answer.answer}</b></div><button aria-label="قراءة صوتية" onClick={speak}><Volume2 size={18}/></button>{answer.data?.length ? <div className="netaj-one-mini-grid">{answer.data.slice(0, 4).map((row, index) => <div key={index}>{Object.entries(row).filter(([key]) => key !== "href").slice(0, 2).map(([key, item]) => <p key={key}><span>{key}</span><b>{typeof item === "number" ? item.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(item ?? "—")}</b></p>)}</div>)}</div> : null}</div>}
      {proposal && preview && <div className="netaj-one-preview"><div className="netaj-one-preview-title"><Check size={19}/><div><b>{String(preview.title ?? copy.preview)}</b><p>{copy.noData}</p></div></div><dl>{Object.entries(preview).filter(([key]) => key !== "title").map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{typeof item === "number" ? item.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(item ?? "—")}</dd></div>)}</dl><div className="netaj-one-review-actions"><button onClick={() => void proposalAction("CONFIRM")}><Check size={17}/>{copy.approve}</button><button onClick={() => void editProposal()}><Pencil size={17}/>{copy.edit}</button><button onClick={() => void proposalAction("CANCEL")}><X size={17}/>{copy.cancel}</button></div></div>}
      <footer>{copy.audit}</footer>
    </section></div>}
  </>;
}
