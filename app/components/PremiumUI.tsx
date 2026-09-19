import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export function PremiumPageHeader({ eyebrow, title, description, action }:{eyebrow?:string;title:string;description?:string;action?:ReactNode}) {
  return <header className="premium-page-header"><div>{eyebrow&&<span className="premium-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</header>;
}

export function PremiumSectionTitle({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:string}) {
  return <div className="premium-section-title"><span className="premium-eyebrow">{eyebrow}</span><div className="flex items-start justify-between gap-4"><div><h2>{title}</h2><p>{description}</p></div>{action&&<Link aria-label={`عرض ${title}`} href={action}><ArrowLeft size={16}/></Link>}</div></div>;
}

export function PremiumSurface({ children, className="" }:{children:ReactNode;className?:string}) {
  return <section className={`premium-panel rounded-2xl border ${className}`}>{children}</section>;
}

export function PremiumEmptyState({text,action}:{text:string;action?:ReactNode}) {
  return <div className="premium-empty"><Sparkles size={20}/><span>{text}</span>{action}</div>;
}

export function PremiumStatusBadge({children,tone="neutral"}:{children:ReactNode;tone?:"success"|"warning"|"danger"|"info"|"neutral"}) {
  return <span className={`premium-status is-${tone}`}>{children}</span>;
}
