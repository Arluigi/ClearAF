'use client';
import { usePathname } from 'next/navigation';
import { ClipboardList, List, LogOut, MessageSquare, Stethoscope, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Worklist', href: '/patients', icon: List },
  { name: 'Messages', href: '/messages', icon: MessageSquare },
  { name: 'Templates', href: '/templates', icon: ClipboardList },
  { name: 'Account', href: '/account', icon: UserRound },
];
const initials = (name?: string) => (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'C';

// Letterpress nav rail (spec §3: 190–210px). Stethoscope is a placeholder mark until PR 8 ships the identity.
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname(); const { user, logout } = useAuth();
  return <div className="flex h-full w-[200px] flex-col border-r border-rule bg-rail">
    <div className="px-4 pb-5 pt-6">
      <div className="flex items-center gap-2"><Stethoscope aria-hidden className="h-5 w-5 text-ink" /><p className="font-display text-[19px] font-light">ClearAF</p></div>
      <p className="eyebrow mt-2">Clinician</p>
    </div>
    <nav aria-label="Portal" className="flex-1">{navigation.map(item => {
      const current = pathname === item.href || pathname.startsWith(item.href + '/');
      return <a key={item.href} href={item.href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={cn('flex items-center gap-2.5 px-3.5 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink', current ? 'bg-ink font-medium text-canvas' : 'font-[450] text-ink-secondary hover:bg-sunk hover:text-ink')}><item.icon aria-hidden className="h-4 w-4" />{item.name}</a>;
    })}</nav>
    <div className="space-y-2 border-t border-rule p-3.5">
      <div className="flex items-center gap-2.5"><Avatar className="h-8 w-8"><AvatarFallback>{initials(user?.name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-[13px] font-medium">{user?.name}</p><p className="truncate font-data text-[11px] text-ink-tertiary">{user?.email}</p></div></div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout()}><LogOut aria-hidden />Sign out</Button>
    </div>
  </div>;
}
