import React from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  User,
  Users,
  Briefcase,
  Calendar,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/ui/PageHeader.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';

const statusColors = {
  Active: 'bg-emerald-500/10 text-emerald-400',
  Inactive: 'bg-slate-500/10 text-slate-400',
  Prospect: 'bg-blue-500/10 text-blue-400',
  Former: 'bg-amber-500/10 text-amber-400'
};

const placementStatusColors = {
  Pending: 'bg-amber-500/10 text-amber-400',
  Started: 'bg-blue-500/10 text-blue-400',
  Sustained: 'bg-emerald-500/10 text-emerald-400',
  Finished: 'bg-slate-500/10 text-slate-400',
  Lost: 'bg-red-500/10 text-red-400'
};

export default function EmployerDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const employerId = urlParams.get('id');

  const { data: employer, isLoading } = useQuery({
    queryKey: ['employer', employerId],
    queryFn: () => base44.entities.Employer.filter({ id: employerId }),
    select: (data) => data[0],
    enabled: !!employerId,
  });

  const { data: employments = [] } = useQuery({
    queryKey: ['employerPlacements', employer?.company_name],
    queryFn: async () => {
      const all = await base44.entities.EmploymentPlacement.list('-start_date', 500);
      return all.filter(e => e.employer_name?.toLowerCase() === employer?.company_name?.toLowerCase());
    },
    enabled: !!employer?.company_name,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list('-created_date', 1000),
  });

  if (isLoading) return <LoadingSpinner />;

  if (!employer) {
    return (
      <div className="p-8 text-center">
        <Building2 className="h-12 w-12 text-slate-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Employer not found</h2>
        <Link to={createPageUrl('EmployerAcademy')}>
          <Button variant="outline">Back to Employers</Button>
        </Link>
      </div>
    );
  }

  const currentPlacements = employments.filter(e => e.status === 'Started' || e.status === 'Sustained');
  const completedPlacements = employments.filter(e => e.status === 'Finished');

  const getParticipantName = (id) => {
    const p = participants.find(p => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : 'Unknown';
  };

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8">
      <Link 
        to={createPageUrl('EmployerAcademy')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Employers
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start gap-6 mb-8">
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600">
          <Building2 className="h-10 w-10 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">{employer.company_name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge className={statusColors[employer.relationship_status]}>
                  {employer.relationship_status}
                </Badge>
                {employer.industry_type && (
                  <Badge className="bg-slate-700 text-slate-300">{employer.industry_type}</Badge>
                )}
              </div>
            </div>
            <Link to={createPageUrl(`EmployerForm?id=${employerId}`)}>
              <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{currentPlacements.length}</p>
            <p className="text-sm text-slate-400">Currently Employed</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{completedPlacements.length}</p>
            <p className="text-sm text-slate-400">Completed</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-white">{employments.length}</p>
            <p className="text-sm text-slate-400">Total Placements</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="details" className="space-y-6">
        <TabsList className="bg-slate-900/50 border border-slate-800 p-1">
          <TabsTrigger value="details" className="data-[state=active]:bg-slate-800">Details</TabsTrigger>
          <TabsTrigger value="placements" className="data-[state=active]:bg-slate-800">
            Placements ({employments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Company Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {employer.abn && (
                  <div className="flex items-start gap-3">
                    <Building2 className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">ABN</p>
                      <p className="text-white">{employer.abn}</p>
                    </div>
                  </div>
                )}
                {(employer.address || employer.suburb) && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Address</p>
                      <p className="text-white">
                        {employer.address && <span>{employer.address}<br /></span>}
                        {employer.suburb}, {employer.state} {employer.postcode}
                      </p>
                    </div>
                  </div>
                )}
                {employer.website && (
                  <div className="flex items-start gap-3">
                    <Globe className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Website</p>
                      <a href={employer.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        {employer.website}
                      </a>
                    </div>
                  </div>
                )}
                {employer.partnership_start_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-slate-500 mt-0.5" />
                    <div>
                      <p className="text-sm text-slate-400">Partnership Started</p>
                      <p className="text-white">{format(new Date(employer.partnership_start_date), 'MMMM d, yyyy')}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Key Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {employer.primary_contact_name && (
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="font-medium text-white">{employer.primary_contact_name}</p>
                    <p className="text-xs text-slate-500 mb-2">Primary Contact</p>
                    {employer.primary_contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Phone className="h-3.5 w-3.5" />
                        {employer.primary_contact_phone}
                      </div>
                    )}
                    {employer.primary_contact_email && (
                      <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                        <Mail className="h-3.5 w-3.5" />
                        {employer.primary_contact_email}
                      </div>
                    )}
                  </div>
                )}
                {employer.secondary_contact_name && (
                  <div className="p-4 rounded-lg bg-slate-800/50">
                    <p className="font-medium text-white">{employer.secondary_contact_name}</p>
                    <p className="text-xs text-slate-500 mb-2">Secondary Contact</p>
                    {employer.secondary_contact_phone && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Phone className="h-3.5 w-3.5" />
                        {employer.secondary_contact_phone}
                      </div>
                    )}
                  </div>
                )}
                {!employer.primary_contact_name && !employer.secondary_contact_name && (
                  <p className="text-slate-500">No contacts added</p>
                )}
              </CardContent>
            </Card>

            {employer.notes && (
              <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-white">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 whitespace-pre-wrap">{employer.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="placements">
          {employments.length > 0 ? (
            <div className="space-y-3">
              {employments.map(placement => (
                <Link
                  key={placement.id}
                  to={createPageUrl(`ParticipantDetail?id=${placement.participant_id}`)}
                  className="block"
                >
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold">
                            {getParticipantName(placement.participant_id).split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="font-medium text-white">{getParticipantName(placement.participant_id)}</p>
                            <p className="text-sm text-slate-400">{placement.job_title} • {placement.employment_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {placement.start_date && (
                            <span className="text-sm text-slate-500">
                              Started {format(new Date(placement.start_date), 'MMM d, yyyy')}
                            </span>
                          )}
                          <Badge className={placementStatusColors[placement.status]}>
                            {placement.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No placements yet"
              description="Participants placed at this employer will appear here"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}