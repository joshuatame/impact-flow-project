import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { 
  FileText, 
  FolderKanban,
  GraduationCap,
  Briefcase,
  ClipboardList,
  Calendar,
  User,
  Files,
  ArrowRight,
  CheckCircle2,
  BarChart3,
  Target,
  FileCheck,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const eventTypes = {
  enrollment: { icon: FolderKanban, color: 'bg-blue-500', label: 'Program Enrollment' },
  casenote: { icon: FileText, color: 'bg-violet-500', label: 'Case Note' },
  training: { icon: GraduationCap, color: 'bg-emerald-500', label: 'Training' },
  employment: { icon: Briefcase, color: 'bg-amber-500', label: 'Employment' },
  survey: { icon: ClipboardList, color: 'bg-pink-500', label: 'Survey' },
  document: { icon: Files, color: 'bg-cyan-500', label: 'Document' },
  phase_change: { icon: ArrowRight, color: 'bg-indigo-500', label: 'Phase Change' },
  participant_update: { icon: User, color: 'bg-slate-500', label: 'Participant Updated' },
  dex_activity: { icon: CheckCircle2, color: 'bg-orange-500', label: 'DEX Activity' },
  saved_report: { icon: BarChart3, color: 'bg-rose-500', label: 'LSI-R Report' },
  action_plan: { icon: Target, color: 'bg-teal-500', label: 'Action Plan' },
  good_news: { icon: Sparkles, color: 'bg-amber-500', label: 'Good News Story' },
};

export default function ParticipantTimeline({ participantId }) {
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', participantId],
    queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ participant_id: participantId }),
  });

  const { data: caseNotes = [] } = useQuery({
    queryKey: ['caseNotes', participantId],
    queryFn: async () => {
      const notes = await base44.entities.CaseNote.list('-interaction_date', 500);
      return notes.filter(note => note.linked_participant_ids?.includes(participantId));
    },
  });

  const { data: trainings = [] } = useQuery({
    queryKey: ['participantTrainings', participantId],
    queryFn: () => base44.entities.ParticipantTraining.filter({ participant_id: participantId }),
  });

  const { data: employments = [] } = useQuery({
    queryKey: ['employmentPlacements', participantId],
    queryFn: () => base44.entities.EmploymentPlacement.filter({ participant_id: participantId }),
  });

  const { data: surveys = [] } = useQuery({
    queryKey: ['surveyResponses', participantId],
    queryFn: () => base44.entities.SurveyResponse.filter({ participant_id: participantId }),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['documents', participantId],
    queryFn: () => base44.entities.Document.filter({ linked_participant_id: participantId }),
  });

  const { data: dexActivities = [] } = useQuery({
    queryKey: ['dexActivities', participantId],
    queryFn: () => base44.entities.DEXActivityRecord.filter({ participant_id: participantId }),
  });

  const { data: savedReports = [] } = useQuery({
    queryKey: ['savedReports', participantId],
    queryFn: () => base44.entities.SavedReport.filter({ participant_id: participantId }),
  });

  const { data: actionPlanItems = [] } = useQuery({
    queryKey: ['actionPlanItems', participantId],
    queryFn: () => base44.entities.ActionPlanItem.filter({ participant_id: participantId }),
  });

  const { data: goodNewsStories = [] } = useQuery({
    queryKey: ['participantGoodNewsStories', participantId],
    queryFn: () => base44.entities.GoodNewsStory.filter({ participant_id: participantId }),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () => base44.entities.Program.list(),
  });

  const { data: trainingActivities = [] } = useQuery({
    queryKey: ['trainingActivities'],
    queryFn: () => base44.entities.TrainingActivity.list(),
  });

  const { data: participant } = useQuery({
    queryKey: ['participant', participantId],
    queryFn: () => base44.entities.Participant.filter({ id: participantId }),
    select: (data) => data[0],
  });

  // Build timeline events
  const events = [
    ...enrollments.map(e => ({
      type: 'enrollment',
      date: e.intake_date || e.created_date,
      title: programs.find(p => p.id === e.program_id)?.program_name || 'Program Enrollment',
      description: `Phase: ${e.current_phase}`,
      data: e
    })),
    ...caseNotes.map(n => ({
      type: 'casenote',
      date: n.interaction_date || n.created_date,
      title: n.title,
      description: n.narrative_text?.substring(0, 100) + (n.narrative_text?.length > 100 ? '...' : ''),
      data: n
    })),
    ...trainings.map(t => ({
      type: 'training',
      date: t.enrollment_date || t.created_date,
      title: trainingActivities.find(a => a.id === t.training_activity_id)?.training_name || 'Training',
      description: `Outcome: ${t.outcome}`,
      data: t
    })),
    ...employments.map(e => ({
      type: 'employment',
      date: e.start_date || e.created_date,
      title: `${e.job_title} at ${e.employer_name}`,
      description: `Status: ${e.status}`,
      data: e
    })),
    ...surveys.map(s => ({
      type: 'survey',
      date: s.completed_date || s.created_date,
      title: s.survey_template_name || 'Survey',
      description: `Risk: ${s.overall_risk_band}`,
      data: s
    })),
    ...documents.map(d => ({
      type: 'document',
      date: d.created_date,
      title: d.file_name,
      description: d.category,
      data: d
    })),
    // DEX Activity records
    ...dexActivities.map(d => ({
      type: 'dex_activity',
      date: d.activity_date || d.created_date,
      title: d.activity_type,
      description: d.details?.employer ? `${d.details.employer} - ${d.details.job_title}` : 
                   d.details?.training_name ? d.details.training_name : 
                   'Activity recorded',
      data: d
    })),
    // Saved Reports (LSI-R)
    ...savedReports.map(r => ({
      type: 'saved_report',
      date: r.created_date,
      title: r.report_type === 'lsi_r_final' ? 'LSI-R Final Report Generated' : 'LSI-R Intake Report Generated',
      description: r.score_change !== undefined 
        ? `Score change: ${r.score_change > 0 ? '+' : ''}${r.score_change} (${r.percentage_improvement?.toFixed(1)}% improvement)`
        : `Generated by ${r.generated_by_name || 'Unknown'}`,
      data: r
    })),
    // Action Plan Items
    ...actionPlanItems.filter(a => a.status === 'Completed').map(a => ({
      type: 'action_plan',
      date: a.completed_date || a.updated_date,
      title: 'Action Plan Item Completed',
      description: a.action_text?.substring(0, 80) + (a.action_text?.length > 80 ? '...' : ''),
      data: a
    })),
    // Action Plan Items Created
    ...actionPlanItems.map(a => ({
      type: 'action_plan',
      date: a.created_date,
      title: 'Action Plan Item Created',
      description: `${a.risk_area || 'General'}: ${a.action_text?.substring(0, 60) + (a.action_text?.length > 60 ? '...' : '')}`,
      data: a
    })),
    // Good News Stories
    ...goodNewsStories.map(s => ({
      type: 'good_news',
      date: s.story_date || s.created_date,
      title: s.title,
      description: s.category,
      data: s
    })),
    // Add participant update event
    ...(participant?.updated_date && participant.updated_date !== participant.created_date ? [{
      type: 'participant_update',
      date: participant.updated_date,
      title: 'Participant Record Updated',
      description: `Current phase: ${participant.current_phase}`,
      data: participant
    }] : []),
  ].filter(e => e.date)
   .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No timeline events"
        description="Activity will appear here as you add data for this participant"
      />
    );
  }

  // Group events by month
  const groupedEvents = events.reduce((acc, event) => {
    const monthKey = format(new Date(event.date), 'MMMM yyyy');
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(event);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.entries(groupedEvents).map(([month, monthEvents]) => (
        <div key={month}>
          <h4 className="text-sm font-medium text-slate-400 mb-4 sticky top-0 bg-slate-950 py-2">
            {month}
          </h4>
          <div className="relative pl-8 space-y-4">
            {/* Timeline line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-800" />
            
            {monthEvents.map((event, idx) => {
              const config = eventTypes[event.type];
              const Icon = config.icon;
              
              return (
                <div key={idx} className="relative">
                  {/* Timeline dot */}
                  <div className={`absolute -left-5 w-6 h-6 rounded-full ${config.color} flex items-center justify-center ring-4 ring-slate-950`}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  
                  {/* Event card */}
                  <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4 hover:border-slate-700/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge className={`${config.color}/10 text-white border-0 mb-2`}>
                          {config.label}
                        </Badge>
                        <h5 className="font-medium text-white">{event.title}</h5>
                        {event.description && (
                          <p className="text-sm text-slate-400 mt-1">{event.description}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {format(new Date(event.date), 'MMM d')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}