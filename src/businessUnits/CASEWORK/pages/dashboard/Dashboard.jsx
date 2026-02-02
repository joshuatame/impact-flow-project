import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import {
    Users,
    FolderKanban,
    Briefcase,
    Plus,
    AlertCircle,
    ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line
} from 'recharts';
import StatsCard from '@/components/ui/StatsCard.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import SurveyCompletionGrid from '@/components/dashboard/SurveyCompletionGrid.jsx';
import DocumentsCompletionGrid from '@/components/dashboard/DocumentsCompletionGrid.jsx';
import { format, subDays } from 'date-fns';

const PHASE_COLORS = {
    'Pre Employment Support': '#f59e0b',
    'Training': '#3b82f6',
    'Employment': '#10b981',
    'Mentoring': '#8b5cf6',
    'Exit': '#64748b'
};

// ✅ Chart text color requirements
const CHART_TEXT = '#ffffff';
const TOOLTIP_STYLE = {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '12px',
    color: CHART_TEXT,
};
const TOOLTIP_LABEL_STYLE = { color: CHART_TEXT };
const TOOLTIP_ITEM_STYLE = { color: CHART_TEXT };

export default function Dashboard() {
    const [user, setUser] = useState(null);
    const [filterMode, setFilterMode] = useState('all'); // 'all', 'my', 'program'
    const [selectedProgramId, setSelectedProgramId] = useState('');

    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const userData = await base44.auth.me();
            setUser(userData);
        } catch (e) {
            // silently ignore for now
        }
    };

    // Check for role view override
    const viewAsRole = typeof window !== 'undefined' ? user?.view_as_role || null : null;
    const effectiveRole = viewAsRole || user?.app_role;
    const canAddParticipants =
        effectiveRole === 'SystemAdmin' ||
        effectiveRole === 'Manager' ||
        effectiveRole === 'ContractsAdmin';
    const isCaseWorker = effectiveRole === 'ClientCaseWorker';

    const { data: participants = [], isLoading: loadingParticipants } = useQuery({
        queryKey: ['participants'],
        queryFn: () => base44.entities.Participant.list('-created_date', 1000),
    });

    const { data: programs = [], isLoading: loadingPrograms } = useQuery({
        queryKey: ['programs'],
        queryFn: () => base44.entities.Program.list('-created_date', 100),
    });

    const { data: caseNotes = [], isLoading: loadingCaseNotes } = useQuery({
        queryKey: ['caseNotes'],
        queryFn: () => base44.entities.CaseNote.list('-created_date', 500),
    });

    const { data: employmentPlacements = [] } = useQuery({
        queryKey: ['employmentPlacements'],
        queryFn: () => base44.entities.EmploymentPlacement.list('-created_date', 500),
    });

    const { data: trainings = [] } = useQuery({
        queryKey: ['participantTrainings'],
        queryFn: () => base44.entities.ParticipantTraining.list('-created_date', 500),
    });

    const { data: fundingRecords = [] } = useQuery({
        queryKey: ['fundingRecords'],
        queryFn: () => base44.entities.FundingRecord.list('-created_date', 500),
    });

    const { data: enrollments = [] } = useQuery({
        queryKey: ['enrollments'],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.list('-created_date', 1000),
    });

    // NEW: tasks for outstanding indicator
    const { data: tasks = [], isLoading: loadingTasks } = useQuery({
        queryKey: ['tasks'],
        queryFn: () => base44.entities.Task.list('-created_date', 500),
    });

    const isLoading = loadingParticipants || loadingPrograms || loadingCaseNotes || loadingTasks;

    // Base program list
    const programList = Array.isArray(programs) ? programs : [];

    // Get participant IDs based on filter mode
    const getFilteredParticipantIds = () => {
        if (filterMode === 'my' && user?.id) {
            return participants
                .filter(p => p.primary_case_worker_id === user?.id)
                .map(p => p.id);
        } else if (filterMode === 'program' && selectedProgramId) {
            return enrollments
                .filter(e => e.program_id === selectedProgramId)
                .map(e => e.participant_id);
        }
        return null; // null means no filter
    };

    const filteredParticipantIds = getFilteredParticipantIds();

    const filteredParticipants = filteredParticipantIds
        ? participants.filter(p => filteredParticipantIds.includes(p.id))
        : participants;

    // Filter case notes
    const filteredCaseNotes = filteredParticipantIds
        ? caseNotes.filter(n => n.linked_participant_ids?.some(id => filteredParticipantIds.includes(id)))
        : caseNotes;

    // Filter employment placements
    const filteredEmployments = filteredParticipantIds
        ? employmentPlacements.filter(e => filteredParticipantIds.includes(e.participant_id))
        : employmentPlacements;

    // Filter trainings
    const filteredTrainings = filteredParticipantIds
        ? trainings.filter(t => filteredParticipantIds.includes(t.participant_id))
        : trainings;

    // Filter funding records
    const filteredFunding =
        filterMode === 'program' && selectedProgramId
            ? fundingRecords.filter(f => f.program_id === selectedProgramId)
            : filteredParticipantIds
                ? fundingRecords.filter(f => f.linked_participant_ids?.some(id => filteredParticipantIds.includes(id)))
                : fundingRecords;

    // NEW: outstanding tasks for current user
    const myOutstandingTasks = tasks.filter(
        t =>
            t.assigned_to_id === user?.id &&
            t.status !== 'Completed' &&
            t.status !== 'Cancelled'
    );

    const filteredStartedPlacements = filteredEmployments.filter(e =>
        e.status === 'Started' || e.status === 'Sustained'
    );

    // Participants by phase - use filtered participants
    const phaseData = Object.entries(
        filteredParticipants.reduce((acc, p) => {
            acc[p.current_phase] = (acc[p.current_phase] || 0) + 1;
            return acc;
        }, {})
    ).map(([name, value]) => ({
        name,
        value,
        fill: PHASE_COLORS[name] || '#64748b',
    }));

    // Case notes over time (last 30 days) - use filtered case notes
    const caseNotesOverTime = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const count = filteredCaseNotes.filter(n =>
            format(new Date(n.created_date), 'yyyy-MM-dd') === dateStr
        ).length;
        return { date: format(date, 'MMM d'), count };
    });

    // Funding by category - use filtered funding
    const fundingByCategory = Object.entries(
        filteredFunding
            .filter(f => f.record_type === 'Expense')
            .reduce((acc, f) => {
                acc[f.category] = (acc[f.category] || 0) + (f.amount || 0);
                return acc;
            }, {})
    ).map(([name, value]) => ({ name, value }));

    // Participants list for display (uses the filtered participants)
    const displayParticipants = filteredParticipants.slice(0, 5);

    if (isLoading) {
        return <LoadingSpinner />;
    }

    const subtitleDate = format(new Date(), 'EEEE, MMMM d, yyyy');
    const subtitleTasks =
        myOutstandingTasks.length > 0
            ? `  ${myOutstandingTasks.length} task${myOutstandingTasks.length === 1 ? '' : 's'} outstanding`
            : '';

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title={`Welcome back, ${user?.full_name?.split(' ')[0] || 'there'}`}
                subtitle={subtitleDate + subtitleTasks}
            >
                {canAddParticipants ? (
                    <Link to={createPageUrl('ParticipantForm')}>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Participant
                        </Button>
                    </Link>
                ) : (
                    isCaseWorker && (
                        <Link to={createPageUrl('ParticipantRequest')}>
                            <Button className="bg-blue-600 hover:bg-blue-700">
                                <Plus className="h-4 w-4 mr-2" />
                                Request Participant
                            </Button>
                        </Link>
                    )
                )}
            </PageHeader>

            {/* Dashboard Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
                <Select value={filterMode} onValueChange={setFilterMode}>
                    <SelectTrigger className="w-40 bg-slate-900/50 border-slate-800 text-white">
                        <SelectValue placeholder="Filter view" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="all" className="text-white">
                            All Data
                        </SelectItem>
                        <SelectItem value="my" className="text-white">
                            My Participants
                        </SelectItem>
                        <SelectItem value="program" className="text-white">
                            By Program
                        </SelectItem>
                    </SelectContent>
                </Select>

                {filterMode === 'program' && (
                    <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                        <SelectTrigger className="w-48 bg-slate-900/50 border-slate-800 text-white">
                            <SelectValue placeholder="Select program" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800">
                            {programList.map(p => (
                                <SelectItem key={p.id} value={p.id} className="text-white">
                                    {p.program_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatsCard
                    title="Participants"
                    value={filteredParticipants.length}
                    icon={Users}
                    gradient="from-blue-500 to-cyan-500"
                />
                <StatsCard
                    title="Programs"
                    value={programList.length}
                    icon={FolderKanban}
                    gradient="from-violet-500 to-purple-500"
                />
                <StatsCard
                    title="Outstanding Tasks"
                    value={myOutstandingTasks.length}
                    icon={AlertCircle}
                    gradient="from-amber-500 to-orange-500"
                />
                <StatsCard
                    title="Employed"
                    value={filteredStartedPlacements.length}
                    icon={Briefcase}
                    gradient="from-emerald-500 to-green-500"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Participants by Phase */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Participants by Phase</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={phaseData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {phaseData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    labelStyle={TOOLTIP_LABEL_STYLE}
                                    itemStyle={TOOLTIP_ITEM_STYLE}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 mt-4">
                        {phaseData.map(item => (
                            <div key={item.name} className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: item.fill }}
                                />
                                <span className="text-sm text-slate-400">{item.name}</span>
                                <span className="text-sm font-medium text-white">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Case Notes Trend */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">
                        Case Notes (Last 30 Days)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={caseNotesOverTime}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="date"
                                    stroke={CHART_TEXT}
                                    tick={{ fill: CHART_TEXT }}
                                    fontSize={12}
                                    tickLine={false}
                                    interval="preserveStartEnd"
                                />
                                <YAxis
                                    stroke={CHART_TEXT}
                                    tick={{ fill: CHART_TEXT }}
                                    fontSize={12}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    contentStyle={TOOLTIP_STYLE}
                                    labelStyle={TOOLTIP_LABEL_STYLE}
                                    itemStyle={TOOLTIP_ITEM_STYLE}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#3b82f6"
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Quick Actions / My Participants */}
                <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white">
                            {filterMode === 'my'
                                ? 'My Participants'
                                : filterMode === 'program'
                                    ? 'Program Participants'
                                    : 'Recent Participants'}
                        </h3>
                        <Link to={createPageUrl('Participants')}>
                            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                                View All
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                    <div className="space-y-3">
                        {displayParticipants.map(participant => (
                            <Link
                                key={participant.id}
                                to={createPageUrl(`ParticipantDetail?id=${participant.id}`)}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold">
                                        {participant.first_name?.[0]}
                                        {participant.last_name?.[0]}
                                    </div>
                                    <div>
                                        <p className="font-medium text-white">
                                            {participant.first_name} {participant.last_name}
                                        </p>
                                        <p className="text-sm text-slate-400">{participant.current_phase}</p>
                                    </div>
                                </div>
                                <Badge
                                    className="bg-slate-700/50 text-slate-300"
                                    style={{
                                        backgroundColor: `${PHASE_COLORS[participant.current_phase]}20`,
                                        color: PHASE_COLORS[participant.current_phase],
                                    }}
                                >
                                    {participant.status}
                                </Badge>
                            </Link>
                        ))}
                        {displayParticipants.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                No participants found
                            </div>
                        )}
                    </div>
                </div>

                {/* Funding Summary */}
                <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
                    {fundingByCategory.length > 0 ? (
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={fundingByCategory} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                                    <XAxis
                                        type="number"
                                        stroke={CHART_TEXT}
                                        tick={{ fill: CHART_TEXT }}
                                        fontSize={12}
                                        tickFormatter={v => `$${v}`}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        stroke={CHART_TEXT}
                                        tick={{ fill: CHART_TEXT }}
                                        fontSize={11}
                                        width={80}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        labelStyle={TOOLTIP_LABEL_STYLE}
                                        itemStyle={TOOLTIP_ITEM_STYLE}
                                        formatter={value => [`$${value.toLocaleString()}`, 'Amount']}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500">
                            No expenses recorded
                        </div>
                    )}
                </div>
            </div>

            {/* Survey Completion Grid */}
            <div className="mt-8">
                <SurveyCompletionGrid />
            </div>

            {/* Documents Completion Grid - directly under Survey Completion Status */}
            <div className="mt-8">
                <DocumentsCompletionGrid filterMode={filterMode} selectedProgramId={selectedProgramId} userId={user?.id} />
            </div>
        </div>
    );
}
