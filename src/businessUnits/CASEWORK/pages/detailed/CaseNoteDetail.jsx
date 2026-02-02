import React from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  FileText,
  Clock,
  MapPin,
  User,
  Calendar,
  Users,
  FolderKanban,
  AlertTriangle,
  CheckCircle,
  Paperclip,
  File,
  Image,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

const noteTypeColours = {
  'Contact': 'bg-blue-500/10 text-blue-400',
  'Session': 'bg-emerald-500/10 text-emerald-400',
  'Phone': 'bg-violet-500/10 text-violet-400',
  'Email': 'bg-amber-500/10 text-amber-400',
  'Outreach': 'bg-pink-500/10 text-pink-400',
  'Other': 'bg-slate-500/10 text-slate-400',
};

export default function CaseNoteDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const caseNoteId = urlParams.get('id');

  const { data: caseNote, isLoading } = useQuery({
    queryKey: ['caseNote', caseNoteId],
    queryFn: () => base44.entities.CaseNote.filter({ id: caseNoteId }),
    select: (data) => data[0],
    enabled: !!caseNoteId,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list(),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () => base44.entities.Program.list(),
  });

  if (isLoading) return <LoadingSpinner />;

  if (!caseNote) {
    return (
      <div className="p-8 text-center">
        <FileText className="h-12 w-12 text-slate-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Case note not found</h2>
        <Link to={createPageUrl('Dashboard')}>
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const linkedParticipants = participants.filter(p => 
    caseNote.linked_participant_ids?.includes(p.id)
  );
  const linkedPrograms = programs.filter(p => 
    caseNote.linked_program_ids?.includes(p.id)
  );

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      <Link 
        to={createPageUrl('Dashboard')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            {caseNote.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={noteTypeColours[caseNote.note_type]}>
              {caseNote.note_type}
            </Badge>
            {caseNote.sensitivity_level === 'Sensitive' && (
              <Badge className="bg-red-500/10 text-red-400">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Sensitive
              </Badge>
            )}
            {caseNote.is_billable_for_dex && (
              <Badge className="bg-violet-500/10 text-violet-400">
                <CheckCircle className="h-3 w-3 mr-1" />
                DEX Reportable
              </Badge>
            )}
          </div>
        </div>
        <Link to={createPageUrl(`CaseNoteForm?id=${caseNoteId}`)}>
          <Button variant="outline" className="border-slate-700 hover:bg-slate-800">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Narrative</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 whitespace-pre-wrap">{caseNote.narrative_text}</p>
            </CardContent>
          </Card>

          {/* Attachments */}
          {caseNote.attachment_urls?.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Paperclip className="h-5 w-5" />
                  Attachments ({caseNote.attachment_urls.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {caseNote.attachment_urls.map((url, idx) => {
                    const name = caseNote.attachment_names?.[idx] || `File ${idx + 1}`;
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                    return (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colours"
                      >
                        {isImage ? (
                          <div className="p-2 rounded-lg bg-emerald-500/10">
                            <Image className="h-5 w-5 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-lg bg-blue-500/10">
                            <File className="h-5 w-5 text-blue-400" />
                          </div>
                        )}
                        <span className="flex-1 text-white truncate">{name}</span>
                        <Download className="h-4 w-4 text-slate-400" />
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Linked Programs */}
          {linkedPrograms.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <FolderKanban className="h-5 w-5" />
                  Linked Programs ({linkedPrograms.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {linkedPrograms.map(program => (
                    <Link
                      key={program.id}
                      to={createPageUrl(`ProgramDetail?id=${program.id}`)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-violet-500/10">
                        <FolderKanban className="h-5 w-5 text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{program.program_name}</p>
                        <p className="text-sm text-slate-400">{program.contract_code}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-slate-400">Author</p>
                  <p className="text-white">{caseNote.author_name || 'Unknown'}</p>
                </div>
              </div>
              {caseNote.interaction_date && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-slate-400">Interaction Date</p>
                    <p className="text-white">
                      {format(new Date(caseNote.interaction_date), 'MMMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}
              {caseNote.duration_minutes && (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-slate-400">Duration</p>
                    <p className="text-white">{caseNote.duration_minutes} minutes</p>
                  </div>
                </div>
              )}
              {caseNote.location && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-slate-400">Location</p>
                    <p className="text-white">{caseNote.location}</p>
                  </div>
                </div>
              )}
              {caseNote.created_date && (
                <div className="flex items-center gap-3 text-sm">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-slate-400">Created</p>
                    <p className="text-white">
                      {format(new Date(caseNote.created_date), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {caseNote.tags?.length > 0 && (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {caseNote.tags.map((tag, idx) => (
                    <Badge key={idx} className="bg-slate-700 text-slate-300">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}