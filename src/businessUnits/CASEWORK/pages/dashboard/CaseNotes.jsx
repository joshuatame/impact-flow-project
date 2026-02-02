import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  FileText,
  Search,
  Plus,
  Filter,
  Calendar,
  User,
  Tag,
  X,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import PageHeader from '@/components/ui/PageHeader.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';
import { cn } from '@/lib/utils';

const noteTypeColours = {
  'Contact': 'bg-blue-500/10 text-blue-400',
  'Session': 'bg-emerald-500/10 text-emerald-400',
  'Phone': 'bg-violet-500/10 text-violet-400',
  'Email': 'bg-amber-500/10 text-amber-400',
  'Outreach': 'bg-pink-500/10 text-pink-400',
  'Other': 'bg-slate-500/10 text-slate-400',
};

export default function CaseNotes() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedTag, setSelectedTag] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: caseNotes = [], isLoading } = useQuery({
    queryKey: ['caseNotes'],
    queryFn: () => base44.entities.CaseNote.list('-interaction_date', 500),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list(),
  });

  // Extract all unique tags from case notes
  const allTags = [...new Set(caseNotes.flatMap(note => note.tags || []))].sort();

  // Filter case notes
  const filteredNotes = caseNotes.filter(note => {
    // Search query - search in title and narrative
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = note.title?.toLowerCase().includes(query);
      const matchesNarrative = note.narrative_text?.toLowerCase().includes(query);
      if (!matchesTitle && !matchesNarrative) return false;
    }

    // Participant filter
    if (selectedParticipant !== 'all') {
      if (!note.linked_participant_ids?.includes(selectedParticipant)) return false;
    }

    // Type filter
    if (selectedType !== 'all' && note.note_type !== selectedType) return false;

    // Tag filter
    if (selectedTag !== 'all' && !note.tags?.includes(selectedTag)) return false;

    // Date range filter
    if (dateFrom && note.interaction_date < dateFrom) return false;
    if (dateTo && note.interaction_date > dateTo) return false;

    return true;
  });

  const getParticipantName = (participantId) => {
    const participant = participants.find(p => p.id === participantId);
    return participant ? `${participant.first_name} ${participant.last_name}` : 'Unknown';
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedParticipant('all');
    setSelectedType('all');
    setSelectedTag('all');
    setDateFrom('');
    setDateTo('');
  };

  const hasActiveFilters = selectedParticipant !== 'all' || selectedType !== 'all' || 
    selectedTag !== 'all' || dateFrom || dateTo;

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8">
      <PageHeader 
        title="Case Notes"
        subtitle={`${filteredNotes.length} case note${filteredNotes.length !== 1 ? 's' : ''}`}
      >
        <Link to={createPageUrl('CaseNoteForm')}>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            New Case Note
          </Button>
        </Link>
      </PageHeader>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search case notes by title or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white pl-10"
            />
          </div>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="border-slate-700 relative">
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 bg-slate-900 border-slate-800 p-4" align="end">
              <div className="space-y-4">
                <div>
                  <Label className="text-slate-300">Participant</Label>
                  <Select value={selectedParticipant} onValueChange={setSelectedParticipant}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue placeholder="All participants" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">All participants</SelectItem>
                      {participants.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-white">
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300">Note Type</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">All types</SelectItem>
                      {['Contact', 'Session', 'Phone', 'Email', 'Outreach', 'Other'].map(type => (
                        <SelectItem key={type} value={type} className="text-white">{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-slate-300">Tag</Label>
                  <Select value={selectedTag} onValueChange={setSelectedTag}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="all" className="text-white">All tags</SelectItem>
                      {allTags.map(tag => (
                        <SelectItem key={tag} value={tag} className="text-white">{tag}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-slate-300">From Date</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">To Date</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                </div>

                {hasActiveFilters && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-slate-400"
                    onClick={clearFilters}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear all filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {selectedParticipant !== 'all' && (
              <Badge className="bg-blue-500/10 text-blue-400 gap-1">
                <User className="h-3 w-3" />
                {getParticipantName(selectedParticipant)}
                <button onClick={() => setSelectedParticipant('all')} className="ml-1 hover:text-blue-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedType !== 'all' && (
              <Badge className="bg-violet-500/10 text-violet-400 gap-1">
                {selectedType}
                <button onClick={() => setSelectedType('all')} className="ml-1 hover:text-violet-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {selectedTag !== 'all' && (
              <Badge className="bg-emerald-500/10 text-emerald-400 gap-1">
                <Tag className="h-3 w-3" />
                {selectedTag}
                <button onClick={() => setSelectedTag('all')} className="ml-1 hover:text-emerald-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {(dateFrom || dateTo) && (
              <Badge className="bg-amber-500/10 text-amber-400 gap-1">
                <Calendar className="h-3 w-3" />
                {dateFrom && dateTo ? `${dateFrom} - ${dateTo}` : dateFrom || `Until ${dateTo}`}
                <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="ml-1 hover:text-amber-300">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No case notes found"
          description={searchQuery || hasActiveFilters 
            ? "Try adjusting your search or filters" 
            : "Create your first case note to get started"
          }
          actionLabel={!searchQuery && !hasActiveFilters ? "New Case Note" : undefined}
          onAction={!searchQuery && !hasActiveFilters ? () => window.location.href = createPageUrl('CaseNoteForm') : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => (
            <Link key={note.id} to={createPageUrl(`CaseNoteDetail?id=${note.id}`)}>
              <Card className="bg-slate-900/50 border-slate-800 hover:bg-slate-800/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "p-2.5 rounded-xl",
                      noteTypeColours[note.note_type]?.replace('text-', 'bg-').replace('/10', '/20') || 'bg-slate-700'
                    )}>
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-white truncate">{note.title}</h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className={noteTypeColours[note.note_type]}>
                            {note.note_type}
                          </Badge>
                          {note.attachment_urls?.length > 0 && (
                            <Badge className="bg-slate-700 text-slate-300">
                              {note.attachment_urls.length} file{note.attachment_urls.length !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm mt-1 line-clamp-2">
                        {note.narrative_text}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
                        {note.interaction_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(note.interaction_date), 'd MMM yyyy')}
                          </span>
                        )}
                        {note.author_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {note.author_name}
                          </span>
                        )}
  
                      </div>
                      {note.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {note.tags.slice(0, 5).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs border-slate-700 text-slate-400">
                              {tag}
                            </Badge>
                          ))}
                          {note.tags.length > 5 && (
                            <Badge variant="outline" className="text-xs border-slate-700 text-slate-500">
                              +{note.tags.length - 5} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}