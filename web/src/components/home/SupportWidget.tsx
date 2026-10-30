'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight, MessageCircle, Send, X } from 'lucide-react';
import { links } from '@/lib/links';
import { BrandMark } from '../BrandLogo';

export function SupportWidget() {
  const t = useTranslations('support');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const topics = [
    { label: t('q1'), href: '#how' },
    { label: t('q2'), href: '#security' },
    { label: t('q3'), href: links.signIn },
    { label: t('q4'), href: links.signUp },
  ];

  return (
    <div className="fixed end-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:end-6 sm:bottom-6">
      {open ? (
        <div
          id="support-panel"
          role="dialog"
          aria-label={t('title')}
          className="rise w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_30px_60px_-20px_rgba(21,40,63,0.45)]"
        >
          <div className="relative overflow-hidden bg-linear-to-br from-primary via-[#127f86] to-blue px-5 pt-5 pb-6 text-white">
            <div aria-hidden className="dot-grid absolute inset-0 opacity-20" />
            <div className="relative flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white shadow-md">
                <BrandMark className="h-8 w-8" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t('title')}</p>
                <p className="flex items-center gap-1.5 text-xs text-white/80">
                  <span className="live-dot h-2 w-2 rounded-full bg-[#7fdccc]" />
                  {t('status')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('close')}
                className="grid h-9 w-9 place-items-center rounded-[10px] text-white/80 transition hover:bg-white/15 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-4 bg-slate-50/70 px-5 py-5">
            <div className="flex items-end gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white shadow-sm">
                <BrandMark className="h-5 w-5" />
              </span>
              <p className="max-w-[85%] rounded-[16px] rounded-es-[4px] border border-border/80 bg-white px-4 py-3 text-sm leading-relaxed text-text shadow-sm">
                {t('greeting')}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-muted">{t('topics')}</p>
              <ul className="space-y-2">
                {topics.map((topic) => (
                  <li key={topic.label}>
                    <a
                      href={topic.href}
                      onClick={() => setOpen(false)}
                      className="group flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-border/80 bg-white px-4 text-sm font-medium text-navy transition hover:border-primary/30 hover:text-primary"
                    >
                      {topic.label}
                      <ChevronRight
                        size={16}
                        className="rtl-flip shrink-0 text-muted transition group-hover:text-primary"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-border/80 p-3">
            <input
              disabled
              placeholder={t('soon')}
              aria-label={t('soon')}
              className="h-11 min-w-0 flex-1 rounded-[12px] border border-border bg-slate-50 px-4 text-sm placeholder:text-muted/80"
            />
            <button
              type="button"
              disabled
              aria-label={t('send')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-slate-100 text-muted"
            >
              <Send size={17} className="rtl-flip" />
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="support-panel"
        aria-label={open ? t('close') : t('open')}
        className="btn-brand relative grid h-14 w-14 place-items-center rounded-full text-white"
      >
        {open ? (
          <X size={22} />
        ) : (
          <>
            <MessageCircle size={24} />
            <span className="absolute top-0.5 end-0.5 h-3.5 w-3.5 rounded-full bg-[#7fdccc] ring-2 ring-white" />
          </>
        )}
      </button>
    </div>
  );
}
