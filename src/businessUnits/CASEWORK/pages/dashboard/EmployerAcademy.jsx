import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Phone,
  Mail,
  Globe,
  Users,
  Briefcase,
  Filter,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const statusColors = {
  Active: 'bg-emerald-500/10 text-emerald-400',
  Inactive: 'bg-slate-500/10 text-slate-400',
  Prospect: 'bg-blue-500/10 text-blue-400',
  Former: 'bg-amber-500/10 text-amber-400'
};

export default function EmployerAcademy() {
  const [searchTerm, setSearchTerm] = useState('');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: employers = [], isLoading } = useQuery({
    queryKey: ['employers'],
    queryFn: () => base44.entities.Employer.list('-created_date', 500),
  });

  const { data: employments = [] } = useQuery({
    queryKey: ['allEmployments'],
    queryFn: () => base44.entities.EmploymentPlacement.list('-created_date', 1000),
  });

  const industries = [...new Set(employers.map(e => e.industry_type).filter(Boolean))];

  const filteredEmployers = employers.filter(employer => {
    const matchesSearch = !searchTerm || 
      employer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employer.industry_type?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesIndustry = industryFilter === 'all' || employer.industry_type === industryFilter;
    const matchesStatus = statusFilter === 'all' || employer.relationship_status === statusFilter;
    return matchesSearch && matchesIndustry && matchesStatus;
  });

  const getEmployerStats = (employerName) => {
    const placements = employments.filter(e => 
      e.employer_name?.toLowerCase() === employerName?.toLowerCase()
    );
    return {
      total: placements.length,
      current: placements.filter(p => p.status === 'Started' || p.status === 'Sustained').length,
      completed: placements.filter(p => p.status === 'Finished').length
    };
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8">
      <PageHeader 
        title="Employer Academy"
        subtitle={`${employers.length} employers in network`}
      >
        <Link to={createPageUrl('EmployerForm')}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Employer
          </Button>
        </Link>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search employers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-slate-900/50 border-slate-800 text-white pl-10"
          />
        </div>
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-48 bg-slate-900/50 border-slate-800 text-white">
            <SelectValue placeholder="Industry" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800">
            <SelectItem value="all" className="text-white">All Industries</SelectItem>
            {industries.map(ind => (
              <SelectItem key={ind} value={ind} className="text-white">{ind}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 bg-slate-900/50 border-slate-800 text-white">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800">
            <SelectItem value="all" className="text-white">All Status</SelectItem>
            {['Active', 'Inactive', 'Prospect', 'Former'].map(s => (
              <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredEmployers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredEmployers.map(employer => {
            const stats = getEmployerStats(employer.company_name);
            return (
              <Link key={employer.id} to={createPageUrl(`EmployerDetail?id=${employer.id}`)}>
                <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
                        <Building2 className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-white truncate">{employer.company_name}</h3>
                            {employer.industry_type && (
                              <p className="text-sm text-slate-400">{employer.industry_type}</p>
                            )}
                          </div>
                          <Badge className={statusColors[employer.relationship_status]}>
                            {employer.relationship_status}
                          </Badge>
                        </div>
                        
                        <div className="flex flex-wrap gap-3 mt-3 text-sm text-slate-400">
                          {employer.suburb && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {employer.suburb}, {employer.state}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-4 mt-4 pt-4 border-t border-slate-800">
                          <div className="text-center">
                            <p className="text-lg font-bold text-white">{stats.current}</p>
                            <p className="text-xs text-slate-500">Current</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-white">{stats.completed}</p>
                            <p className="text-xs text-slate-500">Completed</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-white">{stats.total}</p>
                            <p className="text-xs text-slate-500">Total</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          title="No employers found"
          description={searchTerm || industryFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first employer to get started'}
          actionLabel="Add Employer"
          onAction={() => window.location.href = createPageUrl('EmployerForm')}
        />
      )}
    </div>
  );
}