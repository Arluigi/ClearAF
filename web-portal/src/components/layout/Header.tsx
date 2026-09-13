'use client';
import type { RefObject } from 'react';
import Link from 'next/link';
import { LogOut, Menu, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
export default function Header({ onMenuClick, menuButtonRef, title }: { onMenuClick?: () => void; menuButtonRef?: RefObject<HTMLButtonElement | null>; title?: string }) {
  const { user, logout } = useAuth();
  return <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
    <Button ref={menuButtonRef} variant="ghost" size="sm" className="md:hidden" onClick={onMenuClick} aria-label="Open navigation menu"><Menu className="h-5 w-5" /></Button>
    <h1 className="flex-1 text-xl font-semibold">{title}</h1>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-9 w-9 rounded-full" aria-label="Open account menu"><Avatar className="h-9 w-9"><AvatarFallback>{user?.name?.charAt(0) || 'C'}</AvatarFallback></Avatar></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuLabel>{user?.name}<span className="block text-xs font-normal text-muted-foreground">{user?.email}</span></DropdownMenuLabel><DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/account"><UserRound className="mr-2 h-4 w-4" />Account</Link></DropdownMenuItem>
        <DropdownMenuItem onClick={() => void logout()}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
  </header>;
}
