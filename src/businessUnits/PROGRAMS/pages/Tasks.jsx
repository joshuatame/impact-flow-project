import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  User,
  Calendar,
  Filter,
  ClipboardList,
  X,
  Check,
  RefreshCcw,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import PageHeader from '@/components/ui/PageHeader.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const priorityColors = {
  Low: 'bg-slate-500/10 text-slate-400',
  Medium: 'bg-blue-500/10 text-blue-400',
  High: 'bg-amber-500/10 text-amber-400',
  Urgent: 'bg-red-500/10 text-red-400'
};

const statusColors = {
  Pending: 'bg-amber-500/10 text-amber-400',
  'In Progress': 'bg-blue-500/10 text-blue-400',
  Completed: 'bg-emerald-500/10 text-emerald-400',
  Cancelled: 'bg-slate-500/10 text-slate-400'
};

export default function Tasks() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [calendarUrl, setCalendarUrl] = useState('');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    task_type: 'General',
    priority: 'Medium',
    assigned_to_id: '',
    linked_participant_id: '',
    due_date: ''
  });
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const viewAsRole = typeof window !== 'undefined' ? user?.view_as_role || null : null;
  const effectiveRole = viewAsRole || user?.app_role;
  const canCreateTasks = effectiveRole === 'SystemAdmin' || effectiveRole === 'Manager' || effectiveRole === 'ContractsAdmin';

  const handleSyncCalendar = async () => {
    let token = user.calendar_token;
    if (!token) {
      token = crypto.randomUUID();
      await base44.auth.updateMe({ calendar_token: token });
      queryClient.invalidateQueries(['currentUser']);
    }
    // Construct feed URL
    const feedUrl = `${window.location.origin}/functions/calendarFeed?key=${token}`;
    setCalendarUrl(feedUrl);
    setShowCalendarDialog(true);
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list('-created_date', 500),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list('-created_date', 500),
  });

  const createMutation = useMutation({
    mutationFn: async (taskData) => {
      const assignedUser = users.find(u => u.id === taskData.assigned_to_id);
      await base44.entities.Task.create({
        ...taskData,
        assigned_to_name: assignedUser?.full_name,
        assigned_by_id: user?.id,
        assigned_by_name: user?.full_name,
        requires_confirmation: true
      });


// Create in-app notification + activity log for the assignee
if (assignedUser?.id && assignedUser.id !== user?.id) {
  await base44.entities.Notification.create({
    user_id: assignedUser.id,
    notification_type: 'task_assigned',
    type: 'task_assigned',
    title: `New Task Assigned: ${taskData.title}`,
    message: `Assigned by ${user?.full_name || 'a user'} • Priority: ${taskData.priority}${taskData.due_date ? ` • Due: ${taskData.due_date}` : ''}`,
    link_url: createPageUrl('Tasks'),
    is_read: false,
    task_id: null,
  }).catch(() => {});

  await addDoc(collection(db, 'ActivityLog'), {
    activity_type: 'task_assigned',
    message: `Task assigned: ${taskData.title}`,
    actor_id: user?.id || null,
    actor_name: user?.full_name || null,
    target_user_id: assignedUser.id,
    metadata: {
      title: taskData.title,
      priority: taskData.priority,
      due_date: taskData.due_date || null,
      linked_participant_id: taskData.linked_participant_id || null,
    },
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

      // Send email notification to assignee
      if (assignedUser?.email && assignedUser.id !== user?.id) {
        await base44.integrations.Core.SendEmail({
          to: assignedUser.email,
          subject: `New Task Assigned: ${taskData.title}`,
          body: `You have been assigned a new task by ${user?.full_name}.\n\nTitle: ${taskData.title}\nPriority: ${taskData.priority}\nDue Date: ${taskData.due_date || 'None'}\n\nPlease log in to view details.`
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      setShowCreateDialog(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'General',
        priority: 'Medium',
        assigned_to_id: '',
        linked_participant_id: '',
        due_date: ''
      });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async ({ taskId, notes }) => {
      await base44.entities.Task.update(taskId, {
        status: 'Completed',
        completed_date: new Date().toISOString(),
        completed_by_id: user?.id,
        completed_by_name: user?.full_name,
        completion_notes: notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['tasks']);
      setShowCompleteDialog(false);
      setSelectedTask(null);
      setCompletionNotes('');
    }
  });

  const myTasks = tasks.filter(t => t.assigned_to_id === user?.id && t.status !== 'Completed' && t.status !== 'Cancelled');
  const allPendingTasks = tasks.filter(t => t.status === 'Pending' || t.status === 'In Progress');
  const completedTasks = tasks.filter(t => t.status === 'Completed');

  if (isLoading) return <LoadingSpinner />;

  const getParticipantName = (id) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : '';
  };

  const TaskCard = ({ task }) => (
    <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={priorityColors[task.priority]}>{task.priority}</Badge>
              <Badge className={statusColors[task.status]}>{task.status}</Badge>
            </div>
            <h4 className="font-medium text-white">{task.title}</h4>
            {task.description && (
              <p className="text-sm text-slate-400 mt-1 line-clamp-2">{task.description}</p>
            )}
            <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
              {task.assigned_to_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.assigned_to_name}
                </span>
              )}
              {task.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.due_date), 'MMM d, yyyy')}
                </span>
              )}
              {task.linked_participant_id && (
                <Link 
                  to={createPageUrl(`ParticipantDetail?id=${task.linked_participant_id}`)}
                  className="text-blue-400 hover:underline"
                >
                  {getParticipantName(task.linked_participant_id)}
                </Link>
              )}
            </div>
          </div>
          {task.status !== 'Completed' && task.status !== 'Cancelled' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTask(task);
                setShowCompleteDialog(true);
              }}
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
            >
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8">
      <PageHeader 
        title="Tasks"
        subtitle={`${myTasks.length} tasks assigned to you`}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSyncCalendar} className="border-slate-700 hover:bg-slate-800">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Sync to Outlook
          </Button>
          {canCreateTasks && (
            <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Task
            </Button>
          )}
        </div>
      </PageHeader>

      <Tabs defaultValue="my" className="space-y-6">
        <TabsList className="bg-slate-900/50 border border-slate-800 p-1">
          <TabsTrigger value="my" className="data-[state=active]:bg-slate-800">
            My Tasks ({myTasks.length})
          </TabsTrigger>
          {canCreateTasks && (
            <TabsTrigger value="all" className="data-[state=active]:bg-slate-800">
              All Pending ({allPendingTasks.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="completed" className="data-[state=active]:bg-slate-800">
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my">
          {myTasks.length > 0 ? (
            <div className="grid gap-4">
              {myTasks.map(task => <TaskCard key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle}
              title="No pending tasks"
              description="You're all caught up!"
            />
          )}
        </TabsContent>

        {canCreateTasks && (
          <TabsContent value="all">
            {allPendingTasks.length > 0 ? (
              <div className="grid gap-4">
                {allPendingTasks.map(task => <TaskCard key={task.id} task={task} />)}
              </div>
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No pending tasks"
                description="All tasks have been completed"
              />
            )}
          </TabsContent>
        )}

        <TabsContent value="completed">
          {completedTasks.length > 0 ? (
            <div className="grid gap-4">
              {completedTasks.slice(0, 20).map(task => <TaskCard key={task.id} task={task} />)}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle}
              title="No completed tasks"
              description="Completed tasks will appear here"
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-slate-300">Title *</Label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Task Type</Label>
                <Select value={newTask.task_type} onValueChange={(v) => setNewTask({...newTask, task_type: v})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['Survey', 'Emergency Contact', 'Document Upload', 'Training Enrollment', 'Employment Follow-up', 'Case Note', 'General', 'Other'].map(t => (
                      <SelectItem key={t} value={t} className="text-white">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Priority</Label>
                <Select value={newTask.priority} onValueChange={(v) => setNewTask({...newTask, priority: v})}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['Low', 'Medium', 'High', 'Urgent'].map(p => (
                      <SelectItem key={p} value={p} className="text-white">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Assign To</Label>
              <Select value={newTask.assigned_to_id} onValueChange={(v) => setNewTask({...newTask, assigned_to_id: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id} className="text-white">{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Linked Participant (optional)</Label>
              <Select value={newTask.linked_participant_id} onValueChange={(v) => setNewTask({...newTask, linked_participant_id: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select participant" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                  {participants.filter(p => p.status === 'Active').map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-white">
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Due Date</Label>
              <Input
                type="date"
                value={newTask.due_date}
                onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="flex-1 border-slate-700">
                Cancel
              </Button>
              <Button 
                onClick={() => createMutation.mutate(newTask)}
                disabled={!newTask.title || createMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                Create Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Task Dialog */}
      <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Complete Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-slate-300">Confirm completion of: <strong>{selectedTask?.title}</strong></p>
            <div>
              <Label className="text-slate-300">Completion Notes</Label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Add notes about how the task was completed..."
                rows={3}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowCompleteDialog(false)} className="flex-1 border-slate-700">
                Cancel
              </Button>
              <Button 
                onClick={() => completeMutation.mutate({ taskId: selectedTask?.id, notes: completionNotes })}
                disabled={completeMutation.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Complete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Calendar Sync Dialog */}
      <Dialog open={showCalendarDialog} onOpenChange={setShowCalendarDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Sync to Outlook / Calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-200">
              <p>To see your tasks in Outlook or other calendar apps:</p>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-blue-100/80">
                <li>Copy the link below</li>
                <li>Open Outlook (Web or Desktop)</li>
                <li>Go to <strong>Calendar</strong> → <strong>Add Calendar</strong> → <strong>Subscribe from web</strong></li>
                <li>Paste the link and save</li>
              </ol>
            </div>
            
            <div>
              <Label className="text-slate-300">Your Calendar Feed URL</Label>
              <div className="flex gap-2 mt-1.5">
                <Input 
                  readOnly 
                  value={calendarUrl} 
                  className="bg-slate-950 border-slate-700 text-slate-300 font-mono text-xs"
                />
                <Button 
                  variant="secondary" 
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(calendarUrl);
                    // Optional: show toast
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setShowCalendarDialog(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}