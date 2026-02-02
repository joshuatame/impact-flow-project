import React from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Calendar,
  Users,
  FileText,
  GraduationCap,
  Briefcase,
  DollarSign,
  Flag,
  FolderKanban,
  Play,
  CheckCircle,
  BarChart3,
  Target,
  ClipboardList,
  Sparkles
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const eventTypes = {
  program_start: { icon: Play, color: 'bg-emerald-500', label: 'Program Started' },
  program_end: { icon: CheckCircle, color: 'bg-slate-500', label: 'Program Ended' },
  enrollment: { icon: Users, color: 'bg-blue-500', label: 'Participant Enrolled' },
  case_note: { icon: FileText, color: 'bg-violet-500', label: 'Case Note' },
  training: { icon: GraduationCap, color: 'bg-amber-500', label: 'Training' },
  employment: { icon: Briefcase, color: 'bg-emerald-500', label: 'Employment' },
  funding: { icon: DollarSign, color: 'bg-pink-500', label: 'Funding' },
  milestone: { icon: Flag, color: 'bg-cyan-500', label: 'Milestone' },
  dex_activity: { icon: CheckCircle, color: 'bg-orange-500', label: 'DEX Activity' },
  survey: { icon: ClipboardList, color: 'bg-indigo-500', label: 'Survey' },
  saved_report: { icon: BarChart3, color: 'bg-rose-500', label: 'LSI-R Report' },
  action_plan: { icon: Target, color: 'bg-teal-500', label: 'Action Plan' },
  good_news: { icon: Sparkles, color: 'bg-amber-500', label: 'Good News Story' },
};

export default function ProgramTimeline({ programId }) {
  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => base44.entities.Program.filter({ id: programId }),
    select: (data) => data[0],
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', programId],
    queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ program_id: programId }),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list(),
  });

  const { data: caseNotes = [], isLoading: loadingNotes } = useQuery({
    queryKey: ['programCaseNotes', programId],
    queryFn: async () => {
      const notes = await base44.entities.CaseNote.list('-interaction_date', 500);
      return notes.filter(note => note.linked_program_ids?.includes(programId));
    },
  });

  const { data: trainingActivities = [] } = useQuery({
    queryKey: ['programTrainingActivities', programId],
    queryFn: () => base44.entities.TrainingActivity.filter({ program_id: programId }),
  });

  const { data: participantTrainings = [] } = useQuery({
    queryKey: ['participantTrainings'],
    queryFn: () => base44.entities.ParticipantTraining.list('-created_date', 500),
  });

  const { data: employments = [] } = useQuery({
    queryKey: ['programEmployments', programId],
    queryFn: () => base44.entities.EmploymentPlacement.filter({ program_id: programId }),
  });

  const { data: fundingRecords = [] } = useQuery({
    queryKey: ['programFunding', programId],
    queryFn: () => base44.entities.FundingRecord.filter({ program_id: programId }),
  });

  const { data: dexActivities = [] } = useQuery({
    queryKey: ['programDexActivities', programId],
    queryFn: () => base44.entities.DEXActivityRecord.filter({ program_id: programId }),
  });

  const { data: surveyResponses = [] } = useQuery({
    queryKey: ['programSurveys', programId],
    queryFn: () => base44.entities.SurveyResponse.filter({ program_id: programId }),
  });

  const { data: allSavedReports = [] } = useQuery({
    queryKey: ['allSavedReports'],
    queryFn: () => base44.entities.SavedReport.list('-created_date', 500),
  });

  const { data: allActionPlanItems = [] } = useQuery({
    queryKey: ['allActionPlanItems'],
    queryFn: () => base44.entities.ActionPlanItem.list('-created_date', 500),
  });

  const { data: goodNewsStories = [] } = useQuery({
    queryKey: ['goodNewsStories', programId],
    queryFn: () => base44.entities.GoodNewsStory.filter({ program_id: programId }),
  });

  if (loadingNotes) return <LoadingSpinner />;

  // Build timeline events
  const events = [];

  // Program start
  if (program?.start_date) {
    events.push({
      type: 'program_start',
      date: program.start_date,
      title: 'Program Started',
      description: `${program.program_name} commenced`
    });
  }

  // Program end
  if (program?.end_date) {
    events.push({
      type: 'program_end',
      date: program.end_date,
      title: 'Program Ended',
      description: `${program.program_name} concluded`
    });
  }

  // Enrollments
  enrollments.forEach(enrollment => {
    const participant = participants.find(p => p.id === enrollment.participant_id);
    if (enrollment.intake_date) {
      events.push({
        type: 'enrollment',
        date: enrollment.intake_date,
        title: 'Participant Enrolled',
        description: participant ? `${participant.first_name} ${participant.last_name}` : 'Unknown participant',
        link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
      });
    }
  });

  // Case notes
  caseNotes.forEach(note => {
    if (note.interaction_date) {
      events.push({
        type: 'case_note',
        date: note.interaction_date,
        title: note.title,
        description: `By ${note.author_name || 'Unknown'}`,
        link: createPageUrl(`CaseNoteDetail?id=${note.id}`)
      });
    }
  });

  // Training activities
  trainingActivities.forEach(training => {
    if (training.start_date) {
      events.push({
        type: 'training',
        date: training.start_date,
        title: `Training Started: ${training.training_name}`,
        description: training.provider_name || training.status
      });
    }
    if (training.end_date && training.status === 'Completed') {
      events.push({
        type: 'training',
        date: training.end_date,
        title: `Training Completed: ${training.training_name}`,
        description: training.provider_name || 'Completed'
      });
    }
  });

  // Participant training enrollments for this program's trainings
  const programTrainingIds = trainingActivities.map(t => t.id);
  participantTrainings.forEach(pt => {
    if (programTrainingIds.includes(pt.training_activity_id)) {
      const training = trainingActivities.find(t => t.id === pt.training_activity_id);
      const participant = participants.find(p => p.id === pt.participant_id);
      if (pt.enrollment_date) {
        events.push({
          type: 'training',
          date: pt.enrollment_date,
          title: `Participant Enrolled in Training`,
          description: participant 
            ? `${participant.first_name} ${participant.last_name} - ${training?.training_name || 'Training'}`
            : training?.training_name || 'Training',
          link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
        });
      }
      if (pt.completion_date && pt.outcome === 'Completed') {
        events.push({
          type: 'training',
          date: pt.completion_date,
          title: `Participant Completed Training`,
          description: participant 
            ? `${participant.first_name} ${participant.last_name} - ${training?.training_name || 'Training'}`
            : training?.training_name || 'Training',
          link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
        });
      }
    }
  });

  // Employment placements
  employments.forEach(emp => {
    const participant = participants.find(p => p.id === emp.participant_id);
    if (emp.start_date) {
      events.push({
        type: 'employment',
        date: emp.start_date,
        title: `Employment Started`,
        description: participant 
          ? `${participant.first_name} ${participant.last_name} at ${emp.employer_name}`
          : emp.employer_name,
        link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
      });
    }
  });

  // Funding records
  fundingRecords.forEach(record => {
    if (record.funding_date) {
      events.push({
        type: 'funding',
        date: record.funding_date,
        title: `${record.record_type}: $${record.amount?.toLocaleString()}`,
        description: record.category
      });
    }
  });

  // DEX Activity records
  dexActivities.forEach(dex => {
    const participant = participants.find(p => p.id === dex.participant_id);
    events.push({
      type: 'dex_activity',
      date: dex.activity_date || dex.created_date,
      title: dex.activity_type,
      description: participant 
        ? `${participant.first_name} ${participant.last_name}${dex.details?.employer ? ` - ${dex.details.employer}` : ''}${dex.details?.training_name ? ` - ${dex.details.training_name}` : ''}`
        : dex.details?.employer || dex.details?.training_name || 'Activity recorded',
      link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
    });
  });

  // Survey responses
  surveyResponses.forEach(survey => {
    const participant = participants.find(p => p.id === survey.participant_id);
    events.push({
      type: 'survey',
      date: survey.completed_date || survey.created_date,
      title: survey.survey_template_name || survey.section_name || 'Survey',
      description: participant 
        ? `${participant.first_name} ${participant.last_name} - Risk: ${survey.overall_risk_band || 'N/A'}`
        : `Risk: ${survey.overall_risk_band || 'N/A'}`,
      link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
    });
  });

  // Saved Reports (LSI-R) - filter by participants in this program
  const programParticipantIds = enrollments.map(e => e.participant_id);
  allSavedReports.filter(r => programParticipantIds.includes(r.participant_id)).forEach(report => {
    const participant = participants.find(p => p.id === report.participant_id);
    events.push({
      type: 'saved_report',
      date: report.created_date,
      title: report.report_type === 'lsi_r_final' ? 'LSI-R Final Report' : 'LSI-R Intake Report',
      description: participant 
        ? `${participant.first_name} ${participant.last_name}${report.score_change !== undefined ? ` - Score change: ${report.score_change > 0 ? '+' : ''}${report.score_change}` : ''}`
        : `Generated by ${report.generated_by_name || 'Unknown'}`,
      link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
    });
  });

  // Action Plan Items - filter by participants in this program
  allActionPlanItems.filter(a => programParticipantIds.includes(a.participant_id) && a.status === 'Completed').forEach(action => {
    const participant = participants.find(p => p.id === action.participant_id);
    events.push({
      type: 'action_plan',
      date: action.completed_date || action.updated_date,
      title: 'Action Plan Completed',
      description: participant 
        ? `${participant.first_name} ${participant.last_name}: ${action.action_text?.substring(0, 50)}...`
        : action.action_text?.substring(0, 60),
      link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
    });
  });

  // Good News Stories
  goodNewsStories.forEach(story => {
    const participant = story.participant_id ? participants.find(p => p.id === story.participant_id) : null;
    events.push({
      type: 'good_news',
      date: story.story_date || story.created_date,
      title: story.title,
      description: participant 
        ? `${participant.first_name} ${participant.last_name} - ${story.category}`
        : story.category,
      link: participant ? createPageUrl(`ParticipantDetail?id=${participant.id}`) : null
    });
  });

  // Sort events by date (most recent first)
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No timeline events"
        description="Events will appear here as activity is recorded for this program"
      />
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-800" />

      <div className="space-y-6">
        {events.map((event, index) => {
          const config = eventTypes[event.type];
          const Icon = config.icon;

          const content = (
            <div className="flex items-start gap-4">
              <div className={`relative z-10 p-2 rounded-full ${config.color} shadow-lg`}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium text-white">{event.title}</h4>
                  <Badge className="bg-slate-700/50 text-slate-400 text-xs">
                    {config.label}
                  </Badge>
                </div>
                <p className="text-sm text-slate-400 mt-1">{event.description}</p>
                <p className="text-xs text-slate-500 mt-2">
                  {format(parseISO(event.date), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          );

          return event.link ? (
            <Link
              key={index}
              to={event.link}
              className="block hover:bg-slate-800/30 rounded-lg p-2 -ml-2 transition-colors"
            >
              {content}
            </Link>
          ) : (
            <div key={index} className="p-2 -ml-2">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}