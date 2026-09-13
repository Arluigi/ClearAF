'use client';
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { withAuth } from '@/lib/auth';
import Header from './Header'; import Sidebar from './Sidebar';
function DashboardLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  return <div className="flex h-screen overflow-hidden bg-background"><div className="hidden md:flex"><Sidebar /></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-label="Navigation menu" onCloseAutoFocus={event => { event.preventDefault(); menuButtonRef.current?.focus(); }} className="left-0 top-0 h-full max-w-xs translate-x-0 translate-y-0 p-0 md:hidden"><DialogTitle className="sr-only">Navigation menu</DialogTitle><DialogDescription className="sr-only">Choose a portal page or sign out.</DialogDescription><Sidebar onNavigate={() => setOpen(false)} /></DialogContent></Dialog>
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden"><Header title={title} menuButtonRef={menuButtonRef} onMenuClick={() => setOpen(true)} /><main className="flex-1 overflow-y-auto">{children}</main></div>
  </div>;
}
export default withAuth(DashboardLayout);
