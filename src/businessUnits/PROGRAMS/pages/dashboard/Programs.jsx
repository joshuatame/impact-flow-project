import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import {
    Plus,
    Search,
    FolderKanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import PageHeader from '@/components/ui/PageHeader.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ProgramCard from '@/components/programs/ProgramCard.jsx';

const STATUSES = ['All Status', 'Active', 'Inactive', 'Completed'];

export default function Programs() {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');

    const { data: programs = [], isLoading } = useQuery({
        queryKey: ['programs-list'],
        queryFn: () => base44.entities.Program.list('-created_date', 100),
    });

    const { data: enrollments = [] } = useQuery({
        queryKey: ['program-enrollments'],
        queryFn: () => base44.entities.ParticipantProgramEnrollment.list(),
    });

    const { data: fundingRecords = [] } = useQuery({
        queryKey: ['program-fundingRecords'],
        queryFn: () => base44.entities.FundingRecord.list(),
    });

    const participantCounts = enrollments.reduce((acc, e) => {
        acc[e.program_id] = (acc[e.program_id] || 0) + 1;
        return acc;
    }, {});

    const expenseTotals = fundingRecords
        .filter((f) => f.record_type === 'Expense')
        .reduce((acc, f) => {
            acc[f.program_id] = (acc[f.program_id] || 0) + (f.amount || 0);
            return acc;
        }, {});

    const filteredPrograms = programs.filter((p) => {
        const matchesSearch =
            search === '' ||
            p.program_name?.toLowerCase().includes(search.toLowerCase()) ||
            p.contract_code?.toLowerCase().includes(search.toLowerCase()) ||
            p.funder_name?.toLowerCase().includes(search.toLowerCase());

        const matchesStatus =
            statusFilter === 'All Status' || p.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (isLoading) {
        return <LoadingSpinner />;
    }

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <PageHeader
                title="Programs"
                subtitle={`${filteredPrograms.length} programs`}
            >
                <Link to={createPageUrl('ProgramForm')}>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Program
                    </Button>
                </Link>
            </PageHeader>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, code, or funder..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-slate-500"
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] bg-slate-900/50 border-slate-800 text-white">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                        {STATUSES.map((status) => (
                            <SelectItem key={status} value={status} className="text-white">
                                {status}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Programs Grid */}
            {filteredPrograms.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredPrograms.map((program) => (
                        <ProgramCard
                            key={program.id}
                            program={program}
                            participantCount={participantCounts[program.id] || 0}
                            totalSpent={expenseTotals[program.id] || 0}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    icon={FolderKanban}
                    title="No programs found"
                    description={
                        search || statusFilter !== 'All Status'
                            ? 'Try adjusting your filters'
                            : 'Get started by creating your first program'
                    }
                    actionLabel={
                        !search && statusFilter === 'All Status' ? 'Add Program' : undefined
                    }
                    onAction={() =>
                        (window.location.href = createPageUrl('ProgramForm'))
                    }
                />
            )}
        </div>
    );
}
