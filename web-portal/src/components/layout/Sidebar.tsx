'use client';
import { usePathname } from 'next/navigation';
import { MessageSquare, LogOut, Stethoscope, UserRound, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
const navigation = [{ name: 'Assigned patients', href: '/patients', icon: Users }, { name: 'Messages', href: '/messages', icon: MessageSquare }, { name: 'Templates', href: '/templates', icon: Stethoscope }, { name: 'Account', href: '/account', icon: UserRound }];
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname(); const { user, logout } = useAuth();
  return <div className="flex h-full w-64 flex-col border-r border-rule bg-rail">
    <div className="flex h-16 items-center gap-3 border-b px-6"><Stethoscope aria-hidden className="h-6 w-6 text-ink" /><div><p className="font-semibold">ClearAF</p><p className="text-xs text-ink-secondary">Clinician portal</p></div></div>
    <div className="flex items-center gap-3 border-b p-6"><Avatar><AvatarFallback>{user?.name?.charAt(0) || 'C'}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium">{user?.name}</p><p className="truncate text-xs text-ink-secondary">{user?.email}</p></div></div>
    <nav aria-label="Portal" className="flex-1 space-y-1 p-4">{navigation.map(item => { const current = pathname === item.href || pathname.startsWith(item.href + '/'); return <a key={item.href} href={item.href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink', current ? 'bg-ink text-canvas' : 'text-ink-secondary hover:bg-sunk hover:text-ink')}><item.icon className="h-5 w-5" />{item.name}</a>; })}</nav>
    <div className="border-t p-4"><Button variant="ghost" className="w-full justify-start gap-3" onClick={() => void logout()}><LogOut className="h-5 w-5" />Sign out</Button></div>
  </div>;
}
