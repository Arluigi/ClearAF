'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Stethoscope,
  LayoutDashboard,
  Users,
  Calendar,
  MessageCircle,
  FileText,
  Settings,
  LogOut,
  Bell
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    current: false,
  },
  {
    name: 'Patients',
    href: '/patients',
    icon: Users,
    current: false,
    badge: '24'
  },
  {
    name: 'Appointments',
    href: '/appointments',
    icon: Calendar,
    current: false,
    badge: '8'
  },
  {
    name: 'Messages',
    href: '/messages',
    icon: MessageCircle,
    current: false,
    badge: '12'
  },
  {
    name: 'Prescriptions',
    href: '/prescriptions',
    icon: FileText,
    current: false,
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    current: false,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <div className="flex h-full w-64 flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
          <Stethoscope className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Clear AF</h1>
          <p className="text-xs text-muted-foreground">Dermatologist Portal</p>
        </div>
      </div>

      {/* User Profile */}
      <div className="border-b border-border p-6">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">

            <AvatarFallback className="bg-primary/10 text-primary border border-primary/20">
              {user?.name?.charAt(0) || 'D'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.name || 'Doctor'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || 'Not logged in'}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="p-1 h-auto">
            <Bell className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1">{item.name}</span>
              {item.badge && (
                <Badge
                  variant={isActive ? "secondary" : "outline"}
                  className={cn(
                    "text-xs px-2 py-0.5",
                    isActive ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/20" : ""
                  )}
                >
                  {item.badge}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
