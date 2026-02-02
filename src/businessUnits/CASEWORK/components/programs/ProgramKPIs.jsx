import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Target, Users, GraduationCap, Briefcase, FileText, ClipboardList, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const metricIcons = {
    participants_enrolled: Users,
    training_completed: GraduationCap,
    employment_outcomes: Briefcase,
    employment_sustained: Briefcase,
    case_notes: FileText,
    surveys_completed: ClipboardList,
};

const metricLabels = {
    participants_enrolled: 'Participants Enrolled',
    training_completed: 'Training Completions',
    employment_outcomes: 'Employment Outcomes',
    employment_sustained: 'Employment Sustained (26 wks)',
    case_notes: 'Case Notes Recorded',
    surveys_completed: 'Surveys Completed',
};

export default function ProgramKPIs({ programId, program }) {
    const kpis = program?.kpis || [];

    const { data: enrollments = [] } = useQuery({
        queryKey: ['enrollments', programId],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.filter({ program_id: programId }),
    });

    const { data: allTrainingRecords = [] } = useQuery({
        queryKey: ['allParticipantTrainings'],
        queryFn: () => base44.entities.ParticipantTraining.list('-created_date', 1000),
    });

    const { data: allEmployments = [] } = useQuery({
        queryKey: ['allEmployments'],
        queryFn: () => base44.entities.EmploymentPlacement.list('-created_date', 1000),
    });

    const { data: caseNotes = [] } = useQuery({
        queryKey: ['programCaseNotes', programId],
        queryFn: async () => {
            const notes = await base44.entities.CaseNote.list('-created_date', 1000);
            return notes.filter(note => note.linked_program_ids?.includes(programId));
        },
    });

    const { data: surveyResponses = [] } = useQuery({
        queryKey: ['programSurveys', programId],
        queryFn: () => base44.entities.SurveyResponse.filter({ program_id: programId }),
    });

    const enrolledParticipantIds = enrollments.map(e => e.participant_id);

    // Calculate current values for each metric type
    const getMetricValue = (metricType) => {
        switch (metricType) {
            case 'participants_enrolled':
                return enrollments.length;
            case 'training_completed':
                return allTrainingRecords.filter(t =>
                    enrolledParticipantIds.includes(t.participant_id) && t.outcome === 'Completed'
                ).length;
            case 'employment_outcomes':
                return allEmployments.filter(e =>
                    enrolledParticipantIds.includes(e.participant_id) &&
                    ['Started', 'Sustained', 'Finished'].includes(e.status)
                ).length;
            case 'employment_sustained':
                return allEmployments.filter(e =>
                    enrolledParticipantIds.includes(e.participant_id) && e.week_26_milestone
                ).length;
            case 'case_notes':
                return caseNotes.length;
            case 'surveys_completed':
                return surveyResponses.length;
            default:
                return 0;
        }
    };

    if (kpis.length === 0) {
        return (
            <EmptyState
                icon={Target}
                title="No KPIs Set"
                description="Add KPIs in the program settings to track performance"
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                    <Target className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-white">Key Performance Indicators</h3>
                    <p className="text-sm text-slate-400">Track progress against program targets</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kpis.map((kpi, idx) => {
                    const Icon = metricIcons[kpi.metric_type] || Target;
                    const currentValue = getMetricValue(kpi.metric_type);
                    const targetValue = kpi.target_value || 0;
                    const progress = targetValue > 0 ? Math.min(100, (currentValue / targetValue) * 100) : 0;
                    const isOnTrack = progress >= 75;
                    const isAtRisk = progress >= 50 && progress < 75;
                    const isBehind = progress < 50;

                    return (
                        <div
                            key={idx}
                            className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${isOnTrack ? 'bg-emerald-500/10' : isAtRisk ? 'bg-amber-500/10' : 'bg-red-500/10'
                                        }`}>
                                        <Icon className={`h-5 w-5 ${isOnTrack ? 'text-emerald-400' : isAtRisk ? 'text-amber-400' : 'text-red-400'
                                            }`} />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-white">{kpi.name || metricLabels[kpi.metric_type]}</h4>
                                        <p className="text-xs text-slate-400">{metricLabels[kpi.metric_type]}</p>
                                    </div>
                                </div>
                                <Badge className={
                                    isOnTrack ? 'bg-emerald-500/10 text-emerald-400' :
                                        isAtRisk ? 'bg-amber-500/10 text-amber-400' :
                                            'bg-red-500/10 text-red-400'
                                }>
                                    {isOnTrack ? (
                                        <><TrendingUp className="h-3 w-3 mr-1" />On Track</>
                                    ) : isAtRisk ? (
                                        <><Minus className="h-3 w-3 mr-1" />At Risk</>
                                    ) : (
                                        <><TrendingDown className="h-3 w-3 mr-1" />Behind</>
                                    )}
                                </Badge>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-end justify-between">
                                    <div>
                                        <span className="text-3xl font-bold text-white">{currentValue}</span>
                                        <span className="text-slate-400 ml-1">/ {targetValue}</span>
                                    </div>
                                    <span className={`text-lg font-semibold ${isOnTrack ? 'text-emerald-400' : isAtRisk ? 'text-amber-400' : 'text-red-400'
                                        }`}>
                                        {progress.toFixed(0)}%
                                    </span>
                                </div>
                                <Progress
                                    value={progress}
                                    className={`h-2 ${isOnTrack ? '[&>div]:bg-emerald-500' :
                                            isAtRisk ? '[&>div]:bg-amber-500' :
                                                '[&>div]:bg-red-500'
                                        }`}
                                />
                                <p className="text-xs text-slate-500">
                                    {targetValue - currentValue > 0
                                        ? `${targetValue - currentValue} more to reach target`
                                        : 'Target reached!'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Summary Stats */}
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 mt-6">
                <h4 className="font-medium text-white mb-4">Overall Performance</h4>
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                        <p className="text-2xl font-bold text-emerald-400">
                            {kpis.filter(kpi => {
                                const val = getMetricValue(kpi.metric_type);
                                return kpi.target_value > 0 && (val / kpi.target_value) >= 0.75;
                            }).length}
                        </p>
                        <p className="text-xs text-slate-400">On Track</p>
                    </div>
                    <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                        <p className="text-2xl font-bold text-amber-400">
                            {kpis.filter(kpi => {
                                const val = getMetricValue(kpi.metric_type);
                                const pct = kpi.target_value > 0 ? val / kpi.target_value : 0;
                                return pct >= 0.5 && pct < 0.75;
                            }).length}
                        </p>
                        <p className="text-xs text-slate-400">At Risk</p>
                    </div>
                    <div className="text-center p-3 bg-red-500/10 rounded-lg">
                        <p className="text-2xl font-bold text-red-400">
                            {kpis.filter(kpi => {
                                const val = getMetricValue(kpi.metric_type);
                                return kpi.target_value > 0 && (val / kpi.target_value) < 0.5;
                            }).length}
                        </p>
                        <p className="text-xs text-slate-400">Behind</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
