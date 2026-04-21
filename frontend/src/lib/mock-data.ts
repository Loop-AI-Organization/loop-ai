import type { Workspace, Channel, Thread, Message, Action, User, ContextItem, FileItem } from '@/types';

// Demo user
export const currentUser: User = {
  id: 'user-1',
  name: 'Alex Chen',
  email: 'alex@loop.ai',
  avatar: undefined,
  status: 'online',
};

// Workspaces
export const workspaces: Workspace[] = [
  { id: 'ws-1', name: 'Loop AI', icon: '◎' },
  { id: 'ws-2', name: 'Personal', icon: '◇' },
];

// Channels
export const channels: Channel[] = [
  // Project channels
  { id: 'ch-1', workspaceId: 'ws-1', name: 'product-roadmap', type: 'project', unreadCount: 3, lastMessage: 'New feature prioritization complete' },
  { id: 'ch-2', workspaceId: 'ws-1', name: 'engineering', type: 'project', unreadCount: 0, lastMessage: 'API refactor merged' },
  // Additional project-style channels (no explicit DMs in demo)
  { id: 'ch-3', workspaceId: 'ws-1', name: 'design-review', type: 'project', unreadCount: 1, avatar: 'DR' },
  { id: 'ch-4', workspaceId: 'ws-1', name: 'marketing', type: 'project', unreadCount: 0, avatar: 'MK' },
];

// Threads
export const threads: Thread[] = [
  { id: 'th-1', channelId: 'ch-1', title: 'Q1 Feature Planning', updatedAt: new Date('2025-01-30T10:30:00'), messageCount: 15 },
  { id: 'th-2', channelId: 'ch-1', title: 'User Research Synthesis', updatedAt: new Date('2025-01-29T15:45:00'), messageCount: 8 },
  { id: 'th-3', channelId: 'ch-2', title: 'WebSocket Integration', updatedAt: new Date('2025-01-30T09:00:00'), messageCount: 12 },
];

// Messages for thread th-1
export const messages: Message[] = [
  {
    id: 'msg-1',
    threadId: 'th-1',
    role: 'user',
    content: 'Can you help me prioritize features for Q1? We have user feedback from the last sprint.',
    createdAt: new Date('2025-01-30T10:00:00'),
  },
  {
    id: 'msg-2',
    threadId: 'th-1',
    role: 'assistant',
    content: `I'll analyze the user feedback and help prioritize features. Let me search through the feedback data and create a structured analysis.

Based on my analysis of 127 feedback items from the last sprint, here are the top priorities:

## High Priority (P0)
1. **Real-time collaboration** - 34% of users requested this
2. **Keyboard shortcuts** - 28% mentioned workflow efficiency
3. **Dark mode** - 24% requested theme options

## Medium Priority (P1)
1. Search improvements - 18%
2. Mobile responsiveness - 15%
3. Export functionality - 12%

## Recommended Approach
I suggest focusing on real-time collaboration first, as it aligns with our product vision and has the highest demand. Would you like me to create detailed specs for any of these features?`,
    createdAt: new Date('2025-01-30T10:02:00'),
  },
  {
    id: 'msg-3',
    threadId: 'th-1',
    role: 'user',
    content: 'Yes, create specs for real-time collaboration. Also, can you set up a task to track this?',
    createdAt: new Date('2025-01-30T10:05:00'),
  },
  {
    id: 'msg-4',
    threadId: 'th-1',
    role: 'assistant',
    content: `I'll create the specs and set up tracking for this feature.

## Real-time Collaboration Specification

### Overview
Enable multiple users to work on the same document simultaneously with live cursor presence and instant sync.

### Core Features
- **Presence indicators** - Show who's viewing/editing
- **Cursor sharing** - Display other users' cursors in real-time
- **Conflict resolution** - Operational transforms for concurrent edits
- **Activity feed** - Recent changes sidebar

### Technical Requirements
- WebSocket connection for real-time updates
- CRDT-based state synchronization
- Optimistic UI updates with rollback capability

### Timeline Estimate
- Phase 1 (Presence): 2 weeks
- Phase 2 (Cursors): 1 week  
- Phase 3 (Sync): 3 weeks

I've created a task in Linear to track this initiative. The spec has been saved to your project memory for reference.`,
    createdAt: new Date('2025-01-30T10:08:00'),
  },
  {
    id: 'msg-5',
    threadId: 'th-1',
    role: 'user',
    content: 'What about the technical risks? And who should we involve from engineering?',
    createdAt: new Date('2025-01-30T10:15:00'),
  },
  {
    id: 'msg-6',
    threadId: 'th-1',
    role: 'assistant',
    content: `Let me analyze the technical risks and suggest team composition.

## Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket scaling | Medium | High | Use Redis pub/sub + horizontal scaling |
| State conflicts | High | Medium | Implement robust CRDT library |
| Latency issues | Medium | High | Regional edge servers |
| Data consistency | Low | Critical | Event sourcing + audit log |

## Recommended Team

Based on the project requirements and current team capacity:

**Core Team**
- **Lead**: Marcus Lee (backend architect)
- **Frontend**: Jamie Wu (real-time experience)
- **Infrastructure**: Sam Park (scaling expertise)

**Supporting**
- Design review: Sarah Kim
- QA: Rotating assignment

I've checked calendars and Marcus has availability starting next week. Want me to schedule a kickoff meeting?`,
    createdAt: new Date('2025-01-30T10:18:00'),
  },
  {
    id: 'msg-7',
    threadId: 'th-1',
    role: 'user',
    content: 'Yes, schedule it for Tuesday at 2pm. Send invites to the core team.',
    createdAt: new Date('2025-01-30T10:20:00'),
  },
  {
    id: 'msg-8',
    threadId: 'th-1',
    role: 'assistant',
    content: `Done! I've scheduled the kickoff meeting and sent invites.

**Meeting Details**
- 📅 Tuesday, Feb 4th at 2:00 PM
- ⏱️ Duration: 1 hour
- 📍 Conference Room B / Zoom (hybrid)
- 👥 Attendees: Marcus Lee, Jamie Wu, Sam Park, You

**Agenda Created**
1. Project overview (10 min)
2. Technical architecture review (20 min)
3. Timeline and milestones (15 min)
4. Open discussion (15 min)

I've also shared the feature spec document with all attendees. Is there anything else you'd like me to prepare for the meeting?`,
    createdAt: new Date('2025-01-30T10:22:00'),
  },
];

// Actions for the current thread
export const actions: Action[] = [
  {
    id: 'act-1',
    threadId: 'th-1',
    label: 'Searching feedback database',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:00:30'),
    completedAt: new Date('2025-01-30T10:01:15'),
    output: 'Found 127 feedback items',
    icon: 'search',
  },
  {
    id: 'act-2',
    threadId: 'th-1',
    label: 'Analyzing priorities',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:01:15'),
    completedAt: new Date('2025-01-30T10:01:45'),
    icon: 'brain',
  },
  {
    id: 'act-3',
    threadId: 'th-1',
    label: 'Creating task in Linear',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:07:00'),
    completedAt: new Date('2025-01-30T10:07:30'),
    output: 'Task LOOP-142 created',
    icon: 'check-square',
  },
  {
    id: 'act-4',
    threadId: 'th-1',
    label: 'Saving to memory',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:07:30'),
    completedAt: new Date('2025-01-30T10:07:45'),
    icon: 'bookmark',
  },
  {
    id: 'act-5',
    threadId: 'th-1',
    label: 'Checking team calendars',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:17:00'),
    completedAt: new Date('2025-01-30T10:17:30'),
    icon: 'calendar',
  },
  {
    id: 'act-6',
    threadId: 'th-1',
    label: 'Scheduling meeting',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:21:00'),
    completedAt: new Date('2025-01-30T10:21:30'),
    output: 'Meeting scheduled for Feb 4th',
    icon: 'calendar-plus',
  },
  {
    id: 'act-7',
    threadId: 'th-1',
    label: 'Sending invites',
    status: 'completed',
    startedAt: new Date('2025-01-30T10:21:30'),
    completedAt: new Date('2025-01-30T10:21:45'),
    output: '3 invites sent',
    icon: 'mail',
  },
];

// Context items for inspector
export const contextItems: ContextItem[] = [
  {
    id: 'ctx-1',
    title: 'Project Memory',
    content: 'Q1 2025 focus: Real-time collaboration, keyboard shortcuts, performance improvements. Team capacity: 4 engineers.',
    type: 'memory',
    updatedAt: new Date('2025-01-30T10:08:00'),
  },
  {
    id: 'ctx-2',
    title: 'User Feedback Summary',
    content: 'Top requests: collaboration (34%), shortcuts (28%), dark mode (24%). Pain points: slow search, mobile UX.',
    type: 'summary',
    updatedAt: new Date('2025-01-30T10:02:00'),
  },
  {
    id: 'ctx-3',
    title: 'Team Roster',
    content: 'Core team: Marcus (backend), Jamie (frontend), Sam (infra), Sarah (design). Available bandwidth: ~80%.',
    type: 'document',
    updatedAt: new Date('2025-01-28T14:00:00'),
  },
];

// Files for inspector
export const files: FileItem[] = [
  {
    id: 'file-1',
    name: 'Q1-roadmap.pdf',
    size: 245000,
    type: 'application/pdf',
    uploadedAt: new Date('2025-01-30T09:00:00'),
    url: '#',
  },
  {
    id: 'file-2',
    name: 'user-feedback-analysis.csv',
    size: 89000,
    type: 'text/csv',
    uploadedAt: new Date('2025-01-29T16:00:00'),
    url: '#',
  },
];

// Demo streaming messages for simulation
export const demoStreamingContent = `I'll help you with that request.

Let me analyze the current situation and provide recommendations...

## Analysis Complete

Based on my research, here are the key findings:

1. **Primary insight** - The data shows a clear trend
2. **Secondary observation** - There's room for optimization
3. **Recommendation** - I suggest the following approach

Would you like me to elaborate on any of these points?`;

export const demoActions: Omit<Action, 'id'>[] = [
  { threadId: '', label: 'Searching documents', status: 'pending', icon: 'search' },
  { threadId: '', label: 'Analyzing data', status: 'pending', icon: 'brain' },
  { threadId: '', label: 'Generating summary', status: 'pending', icon: 'file-text' },
  { threadId: '', label: 'Saving to memory', status: 'pending', icon: 'bookmark' },
];
