import React, { useEffect, useState } from 'react';
import BrandIdentity from '@/components/BrandIdentity';
import { Link } from 'react-router-dom';
import { History, MessagesSquare, Plus, Sparkles, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AstraChatPanel from '@/components/astra/AstraChatPanel';
import AstraConversationsPanel from '@/components/astra/AstraConversationsPanel';
import AstraJobsPanel from '@/components/astra/AstraJobsPanel';
import useAstraChat from '@/hooks/useAstraChat';

// One page holds everything Astra: the live chat, past conversations and the crew job log.
export default function AdminAstra() {
  const [user, setUser] = useState();
  const [tab, setTab] = useState('chat');
  const chat = useAstraChat();
  useEffect(() => { base44.auth.me().then(setUser); }, []);

  const openConversation = id => { chat.open(id); setTab('chat'); };

  if (!user) return <div className="validate-surface flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" /></div>;
  if (user.role !== 'admin') return <main className="validate-surface flex min-h-screen items-center justify-center px-5"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center"><h1 className="font-display text-xl font-semibold">Admin access required</h1><p className="mt-2 text-sm text-muted-foreground">Astra is restricted to administrator accounts.</p><Link to="/" className="mt-5 inline-block text-sm text-primary underline">Return home</Link></div></main>;

  return <div className="validate-surface min-h-screen text-foreground">
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2">
        <Link to="/" aria-label="Close Astra" className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-card"><X className="h-5 w-5" /></Link>
        <div className="flex-1 min-w-0"><p className="font-mono text-[10px] leading-none tracking-[0.3em] text-primary">ADMIN · ASTRA</p><h1 className="font-display font-semibold leading-tight">Repository agent</h1></div>
        <Button variant="outline" size="sm" disabled={chat.busy} onClick={() => { chat.reset(); setTab('chat'); }} className="gap-1.5"><Plus size={14} />New chat</Button>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6"><BrandIdentity className="mb-5" />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="sticky top-14 z-30 -mx-4 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <TabsList className="w-full">
            <TabsTrigger value="chat" className="flex-1 gap-1.5"><Sparkles size={14} />Chat</TabsTrigger>
            <TabsTrigger value="conversations" className="flex-1 gap-1.5"><MessagesSquare size={14} />Chats</TabsTrigger>
            <TabsTrigger value="jobs" className="flex-1 gap-1.5"><History size={14} />Jobs</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="chat" className="mt-6"><AstraChatPanel chat={chat} /></TabsContent>
        <TabsContent value="conversations" className="mt-6"><AstraConversationsPanel activeId={chat.conversationId} onOpen={openConversation} /></TabsContent>
        <TabsContent value="jobs" className="mt-6"><AstraJobsPanel /></TabsContent>
      </Tabs>
    </main>
  </div>;
}