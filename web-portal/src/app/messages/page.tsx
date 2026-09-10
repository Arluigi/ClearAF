'use client';

import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Search,
  Send,
  Paperclip,
  Image as ImageIcon,
  Phone,
  Video,
  MoreVertical,
  Filter,
  Plus,
  CheckCheck,
  Clock,
  MessageCircle,
  Users,
  AlertCircle
} from 'lucide-react';
import { Message, User } from '@/types/api';
import { useAuth } from '@/lib/auth';
import { apiService } from '@/lib/api';

interface Conversation {
  id: string;
  patient: User;
  lastMessage: Message;
  unreadCount: number;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch conversations (patients who have messaged this dermatologist)
  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError('');

      // For now, since the backend endpoint is incomplete, we'll fetch patients with messages
      const patientsResponse = await apiService.getPatients(1, 50);
      const patients = patientsResponse.data;

      // Create mock conversations for patients (would be replaced with real API)
      const mockConversations: Conversation[] = patients.map(patient => ({
        id: patient.id,
        patient,
        lastMessage: {
          id: `last-${patient.id}`,
          senderId: patient.id,
          receiverId: user?.id || '',
          content: 'No messages yet...',
          messageType: 'text',
          isRead: true,
          createdAt: new Date().toISOString()
        },
        unreadCount: 0
      }));

      setConversations(mockConversations);
      if (mockConversations.length > 0) {
        setSelectedConversation(mockConversations[0]);
      }
    } catch (error) {

      setError('Failed to load conversations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch messages for selected conversation
  const fetchMessages = async (patientId: string) => {
    try {
      setMessagesLoading(true);
      const response = await apiService.getMessages(1, 50, patientId);
      setMessages(response.data);
    } catch (error) {

      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const sentMessage = await apiService.sendMessage({
        receiverId: selectedConversation.patient.id,
        content: newMessage,
        messageType: 'text'
      });

      setMessages(prev => [...prev, sentMessage]);
      setNewMessage('');

      // Update conversation last message
      setConversations(prev => prev.map(conv =>
        conv.id === selectedConversation.id
          ? { ...conv, lastMessage: sentMessage }
          : conv
      ));
    } catch (error) {

      setError('Failed to send message. Please try again.');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load conversations on mount
  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);

  // Load messages when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.patient.id);
    }
  }, [selectedConversation]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } else if (diffInHours < 168) { // Less than a week
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const formatMessageTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const filteredConversations = (conversations || []).filter(conv => {
    const patientName = conv.patient?.name || '';
    const messageContent = conv.lastMessage?.content || '';
    const matchesSearch = patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         messageContent.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' ||
                         (filterStatus === 'unread' && conv.unreadCount > 0) ||
                         (filterStatus === 'read' && conv.unreadCount === 0);
    return matchesSearch && matchesFilter;
  });

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  return (
    <DashboardLayout title="Messages">
      <div className="h-[calc(100vh-8rem)] flex">
        {/* Conversations List */}
        <div className="w-80 border-r border-border flex flex-col bg-card">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Messages</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Message</DialogTitle>
                    <DialogDescription>
                      Start a conversation with a patient
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {conversations.map(conv => (
                          <SelectItem key={conv.patient.id} value={conv.patient.id}>
                            {conv.patient.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea placeholder="Type your message..." />
                    <Button className="w-full">Send Message</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Messages</SelectItem>
                <SelectItem value="unread">Unread ({totalUnread})</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-sm text-muted-foreground">Loading conversations...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center p-8">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <div className="text-center">
                  <MessageCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No conversations yet</p>
                </div>
              </div>
            ) : (
              filteredConversations.map(conversation => (
              <div
                key={conversation.id}
                onClick={() => setSelectedConversation(conversation)}
                className={`p-4 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors ${
                  selectedConversation?.id === conversation.id ? 'bg-muted' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-12 w-12">

                      <AvatarFallback className="bg-primary/10 text-primary">
                        {conversation.patient.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    {conversation.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 h-5 w-5 bg-clearaf-red rounded-full flex items-center justify-center">
                        <span className="text-xs text-white font-medium">
                          {conversation.unreadCount}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium truncate">{conversation.patient.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(conversation.lastMessage.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {conversation.patient.skinType}
                      </Badge>
                      {conversation.patient.currentSkinScore && (
                        <span className="text-xs text-muted-foreground">
                          Score: {conversation.patient.currentSkinScore}
                        </span>
                      )}
                    </div>

                    <p className={`text-sm truncate ${
                      conversation.unreadCount > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                    }`}>
                      {conversation.lastMessage.senderId === 'dr1' ? 'You: ' : ''}
                      {conversation.lastMessage.content}
                    </p>
                  </div>
                </div>
              </div>
            )))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-border bg-background">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">

                      <AvatarFallback className="bg-primary/10 text-primary">
                        {selectedConversation.patient.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-medium">{selectedConversation.patient.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{selectedConversation.patient.skinType || 'Unknown'} skin</span>
                        {selectedConversation.patient.currentSkinScore && (
                      <>
                        <span>•</span>
                        <span>Score: {selectedConversation.patient.currentSkinScore}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm">
                  <Phone className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Video className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : (
              messages.map((message, index) => {
                const isFromDoctor = message.senderId === user?.id;
                const messageDate = message.sentDate || message.createdAt;
                const showTime = index === 0 ||
                  new Date(messageDate).getTime() - new Date(messages[index - 1].sentDate || messages[index - 1].createdAt).getTime() > 300000; // 5 minutes

                return (
                  <div key={`${message.id}-${index}`}>
                    {showTime && (
                      <div className="text-center text-xs text-muted-foreground mb-4">
                        {formatMessageTime(messageDate)}
                      </div>
                    )}
                    <div className={`flex ${isFromDoctor ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md xl:max-w-lg ${
                        isFromDoctor ? 'order-1' : 'order-2'
                      }`}>
                        <div className={`px-4 py-2 rounded-2xl ${
                          isFromDoctor
                            ? 'bg-clearaf-purple text-white'
                            : 'bg-muted text-foreground'
                        }`}>
                          <p className="text-sm">{message.content}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${
                          isFromDoctor ? 'justify-end' : 'justify-start'
                        }`}>
                          <span>{formatMessageTime(messageDate)}</span>
                          {isFromDoctor && (
                            <div className="flex">
                              {message.isRead ? (
                                <CheckCheck className="h-3 w-3 text-clearaf-blue" />
                              ) : (
                                <CheckCheck className="h-3 w-3" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-border bg-background">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <div className="flex-1">
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="min-h-[40px] max-h-32 resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
              </div>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="sm">
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button type="submit" size="sm" disabled={!newMessage.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No conversation selected</h3>
              <p className="text-muted-foreground">Choose a patient from the sidebar to start messaging</p>
            </div>
          </div>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
