import * as React from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export default function WorkspaceHeader({ name, since, onMessage, children }: { name: string; since: string; onMessage: () => void; children?: ReactNode }) {
  return <header className="flex flex-wrap items-end gap-4 border-b-2 border-ink pb-5">
    <div className="min-w-0 flex-1 space-y-2">
      {since && <p className="meta-mono">{since}</p>}
      <h1 className="editorial-title break-words text-[36px] leading-tight">{name || 'Unnamed patient'}</h1>
      {children}
    </div>
    <Button variant="outline" onClick={onMessage}>Message</Button>
  </header>;
}
