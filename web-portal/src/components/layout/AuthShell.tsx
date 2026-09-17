import * as React from 'react';
import type { ReactNode } from 'react';

// Split sign-in layout (portal mockup "Portal login"): paper form column and an ink quote panel.
// The wordmark is plain text until PR 8 ships the mark; `data-placeholder` marks it for replacement.
export default function AuthShell({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <main className="flex min-h-screen bg-canvas text-ink">
    <div className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-1/2 lg:px-16">
      <p data-placeholder="wordmark" className="font-display text-[22px] font-light tracking-[0.18em]">clear<span className="italic">af</span></p>
      <div className="flex flex-1 flex-col justify-center py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="editorial-title text-[34px]">{title}</h1>
          </div>
          {children}
        </div>
      </div>
      <p className="meta-mono">Signed-in sessions stay in this browser until you sign out</p>
    </div>
    <aside aria-label="About the clinician portal" className="hidden flex-col justify-end bg-ink p-12 text-canvas lg:flex lg:w-1/2">
      <blockquote className="max-w-md font-display text-[30px] font-light leading-snug">“Photos, routines and check-ins, in the order they happened.”</blockquote>
      <p className="eyebrow mt-6 text-canvas">What the record tells you before the appointment does</p>
    </aside>
  </main>;
}
