import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  FileText,
  Users,
  FolderKanban,
  Tag,
  Search,
  Mic,
  MicOff,
  Paperclip,
  X,
  Upload,
  File,
  Image,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function isEmploymentActive(status) {
  const s = (status || '').toString();
  return !['Finished', 'Lost'].includes(s);
}

export default function CaseNoteForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const caseNoteId = urlParams.get('id');
  const preselectedParticipantId = urlParams.get('participant_id');
  const preselectedProgramId = urlParams.get('program_id');
  const isEditing = !!caseNoteId;
  const queryClient = useQueryClient();

  const [participantSearch, setParticipantSearch] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-AU';

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setFormData(prev => ({
            ...prev,
            narrative_text: prev.narrative_text + finalTranscript
          }));
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  }, []);

  const toggleDictation = () => {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  };

  const [formData, setFormData] = useState({  employment_conversation: false,
  mentoring_conversation: false,

    title: '',
    narrative_text: '',
    note_type: 'Contact',
    interaction_date: todayISO(),
    duration_minutes: '',
    location: '',
    sensitivity_level: 'Normal',
    linked_participant_ids: preselectedParticipantId ? [preselectedParticipantId] : [],
    linked_program_ids: preselectedProgramId ? [preselectedProgramId] : [],
    is_billable_for_dex: false,
    mentoring_engagement: false,
    tags: [],
    attachment_urls: [],
    attachment_names: []
  });
  const [newTag, setNewTag] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: existingNote, isLoading: loadingNote } = useQuery({
    queryKey: ['caseNote', caseNoteId],
    queryFn: () => base44.entities.CaseNote.filter({ id: caseNoteId }),
    select: (data) => data[0],
    enabled: isEditing,
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => base44.entities.Participant.list('-created_date', 500),
  });

  const { data: programs = [] } = useQuery({
    queryKey: ['programs'],
    queryFn: () => base44.entities.Program.list(),
  });

  useEffect(() => {
    if (existingNote) {
      setFormData({
        title: existingNote.title || '',
        narrative_text: existingNote.narrative_text || '',
        note_type: existingNote.note_type || 'Contact',
        interaction_date: existingNote.interaction_date || '',
        duration_minutes: existingNote.duration_minutes || '',
        location: existingNote.location || '',
        sensitivity_level: existingNote.sensitivity_level || 'Normal',
        linked_participant_ids: existingNote.linked_participant_ids || [],
        linked_program_ids: existingNote.linked_program_ids || [],
        is_billable_for_dex: existingNote.is_billable_for_dex || false,
        mentoring_engagement: existingNote.mentoring_engagement || false,
        tags: existingNote.tags || [],
        attachment_urls: existingNote.attachment_urls || [],
        attachment_names: existingNote.attachment_names || []
      });
    }
  }, [existingNote]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const newUrls = [];
    const newNames = [];

    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      newUrls.push(file_url);
      newNames.push(file.name);
    }

    setFormData(prev => ({
      ...prev,
      attachment_urls: [...prev.attachment_urls, ...newUrls],
      attachment_names: [...prev.attachment_names, ...newNames]
    }));
    setUploading(false);
  };

  const removeAttachment = (index) => {
    setFormData(prev => ({
      ...prev,
      attachment_urls: prev.attachment_urls.filter((_, i) => i !== index),
      attachment_names: prev.attachment_names.filter((_, i) => i !== index)
    }));
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  // Supporting lists for DEX engagement logic
  const { data: allParticipants = [] } = useQuery({
    queryKey: ['allParticipants'],
    queryFn: () => base44.entities.Participant.list(),
  });

  const { data: allEnrollments = [] } = useQuery({
    queryKey: ['allEnrollments'],
    queryFn: () => base44.entities.ParticipantProgramEnrollment.list(),
  });

  const { data: allPrograms = [] } = useQuery({
    queryKey: ['allPrograms'],
    queryFn: () => base44.entities.Program.list(),
  });

  const { data: allEmploymentPlacements = [] } = useQuery({
    queryKey: ['allEmploymentPlacements'],
    queryFn: () => base44.entities.EmploymentPlacement.list(),
  });

  const { data: allParticipantTrainings = [] } = useQuery({
    queryKey: ['allParticipantTrainings'],
    queryFn: () => base44.entities.ParticipantTraining.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
      mentoring_engagement: !!formData.mentoring_conversation,
        ...data,
        duration_minutes: data.duration_minutes ? Number(data.duration_minutes) : null,
        author_user_id: user?.id,
        author_name: user?.full_name
      };

      let result;
      if (isEditing) {
        result = await base44.entities.CaseNote.update(caseNoteId, payload);
      } else {
        result = await base44.entities.CaseNote.create(payload);

        // Create DEX records for engagement (Stage Engagement) when in a DEX active program
        for (const participantId of data.linked_participant_ids) {
          const participant = allParticipants.find(p => p.id === participantId);
          if (!participant) continue;

          const dexEnrollment = allEnrollments
            .filter((e) => e.participant_id === participantId && e.status !== 'Exited')
            .find((e) => {
              const program = allPrograms.find((p) => p.id === e.program_id);
              return !!program?.dex_reporting_required;
            }) || null;

          const programId = dexEnrollment?.program_id || null;
          if (!programId) continue;

          const hasActiveEmployment = allEmploymentPlacements
            .filter((p) => p.participant_id === participantId)
            .some((p) => isEmploymentActive(p?.status));

          const hasActiveTraining = allParticipantTrainings
            .filter((t) => t.participant_id === participantId)
            .some((t) => (t?.outcome || '') === 'In Progress');

          const activityTypes = [];
          if (hasActiveTraining) {
            activityTypes.push("Training Engagement");
          } else {
            if (data.employment_conversation) activityTypes.push("Employment Engagement");
            if (data.mentoring_conversation) activityTypes.push("Mentoring Engagement");

            // fallback to Employment Engagement if they have active employment and nothing selected
            if (!activityTypes.length && hasActiveEmployment) activityTypes.push("Employment Engagement");
          }

          // Create DEX engagement(s) when reportable
          if (activityTypes.length && data.is_billable_for_dex) {
            const participantName = participant.full_name || `${participant.first_name || ''} ${participant.last_name || ''}`.trim();
            const caseLocation = dexEnrollment?.dex_case_location || null;

            for (const activityType of activityTypes) {
            await base44.entities.DEXActivityRecord.create({
              participant_id: participantId,
              participant_name: participantName,
              program_id: programId,
              activity_type: activityType,
              activity_date: data.interaction_date || todayISO(),
              reference_entity_type: 'CaseNote',
              reference_entity_id: result.id,
              case_location: caseLocation,
              service_setting: data.location || null,
              details: {
                title: data.title,
                note_type: data.note_type,
                stage_engagement: activityType,
                service_setting: data.location || null
              },
              recorded_by_id: user?.id,
              recorded_by_name: user?.full_name
            });
          }
          }
        }
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['caseNotes']);
      if (preselectedParticipantId) {
        window.location.href = createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`);
      } else if (preselectedProgramId) {
        window.location.href = createPageUrl(`ProgramDetail?id=${preselectedProgramId}`);
      } else {
        window.location.href = createPageUrl('Dashboard');
      }
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleParticipant = (participantId) => {
    setFormData(prev => ({
      ...prev,
      linked_participant_ids: prev.linked_participant_ids.includes(participantId)
        ? prev.linked_participant_ids.filter(id => id !== participantId)
        : [...prev.linked_participant_ids, participantId]
    }));
  };

  const toggleProgram = (programId) => {
    setFormData(prev => ({
      ...prev,
      linked_program_ids: prev.linked_program_ids.includes(programId)
        ? prev.linked_program_ids.filter(id => id !== programId)
        : [...prev.linked_program_ids, programId]
    }));
  };

  if (isEditing && loadingNote) {
    return <LoadingSpinner />;
  }

  const activeParticipants = participants
    .filter(p => p.status === 'Active')
    .filter(p => {
      if (!participantSearch) return true;
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      return name.includes(participantSearch.toLowerCase());
    })
    .sort((a, b) => {
      const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
      const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const activePrograms = programs.filter(p => p.status === 'Active');

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      <Link
        to={preselectedParticipantId
          ? createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`)
          : createPageUrl('Dashboard')
        }
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
        {isEditing ? 'Edit Case Note' : 'New Case Note'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Note Details */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Note Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => updateField('title', e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Brief summary of the interaction"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-300">Narrative *</Label>
                {recognition && (
                  <Button
                    type="button"
                    variant={isListening ? "destructive" : "outline"}
                    size="sm"
                    onClick={toggleDictation}
                    className={isListening ? "bg-red-600 hover:bg-red-700" : "border-slate-700"}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="h-4 w-4 mr-2" />
                        Stop Dictation
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 mr-2" />
                        Dictate
                      </>
                    )}
                  </Button>
                )}
              </div>
              {isListening && (
                <div className="mb-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                  <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-400">Listening... Speak now</span>
                </div>
              )}
              <Textarea
                value={formData.narrative_text}
                onChange={(e) => updateField('narrative_text', e.target.value)}
                className="bg-slate-800 border-slate-700 text-white min-h-[200px]"
                placeholder="Detailed notes about the interaction..."
                required
              />
            </div>
            
            <div className="mt-4">
              <Label className="text-slate-300">Conversation Type (for DEX Engagement)</Label>
              <div className="flex flex-wrap gap-6 mt-2">
                <label className="flex items-center gap-2 text-slate-200">
                  <Checkbox
                    checked={!!formData.employment_conversation}
                    onCheckedChange={(v) => setFormData({ ...formData, employment_conversation: !!v })}
                  />
                  Employment Conversation
                </label>
                <label className="flex items-center gap-2 text-slate-200">
                  <Checkbox
                    checked={!!formData.mentoring_conversation}
                    onCheckedChange={(v) => setFormData({ ...formData, mentoring_conversation: !!v })}
                  />
                  Mentoring Conversation
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Select one or both. Training stage will record Training Engagement regardless.
              </p>
            </div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Note Type</Label>
                <Select value={formData.note_type} onValueChange={(v) => updateField('note_type', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['Contact', 'Session', 'Phone', 'Email', 'Outreach', 'Other'].map(opt => (
                      <SelectItem key={opt} value={opt} className="text-white">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Date</Label>
                <Input
                  type="date"
                  value={formData.interaction_date}
                  onChange={(e) => updateField('interaction_date', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.duration_minutes}
                  onChange={(e) => updateField('duration_minutes', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="e.g., 30"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Location</Label>
                <Select value={formData.location} onValueChange={(v) => updateField('location', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {[
                      'Organisation Outlet / Office',
                      "Client's Residence",
                      'Community Venue',
                      'Partner Organisation',
                      'Telephone',
                      'Video',
                      'Online Service',
                      'Healthcare Facility',
                      'Education Facility',
                      'Justice Facility'
                    ].map(opt => (
                      <SelectItem key={opt} value={opt} className="text-white">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Sensitivity</Label>
                <Select value={formData.sensitivity_level} onValueChange={(v) => updateField('sensitivity_level', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="Normal" className="text-white">Normal</SelectItem>
                    <SelectItem value="Sensitive" className="text-white">Sensitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Link to Participants */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="h-5 w-5" />
              Link Participants
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Search participants..."
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white pl-10"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {activeParticipants.map(participant => (
                <label
                  key={participant.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                >
                  <Checkbox
                    checked={formData.linked_participant_ids.includes(participant.id)}
                    onCheckedChange={() => toggleParticipant(participant.id)}
                  />
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-sm font-semibold">
                    {participant.first_name?.[0]}{participant.last_name?.[0]}
                  </div>
                  <span className="text-white">
                    {participant.first_name} {participant.last_name}
                  </span>
                </label>
              ))}
              {activeParticipants.length === 0 && participantSearch && (
                <p className="text-center text-slate-500 py-4">No participants found</p>
              )}
            </div>
            {formData.linked_participant_ids.length > 0 && (
              <p className="text-sm text-slate-400 mt-3">
                {formData.linked_participant_ids.length} participant(s) selected
              </p>
            )}
          </CardContent>
        </Card>

        {/* Link to Programs */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Link Programs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {activePrograms.map(program => (
                <label
                  key={program.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                >
                  <Checkbox
                    checked={formData.linked_program_ids.includes(program.id)}
                    onCheckedChange={() => toggleProgram(program.id)}
                  />
                  <span className="text-white">{program.program_name}</span>
                  <span className="text-slate-500 text-sm">({program.contract_code})</span>
                </label>
              ))}
            </div>
            {formData.linked_program_ids.length > 0 && (
              <p className="text-sm text-slate-400 mt-3">
                {formData.linked_program_ids.length} program(s) selected
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tags */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <Button type="button" onClick={addTag} variant="outline" className="border-slate-700">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-700 text-slate-300 text-sm"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attachments */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Attachments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-6 text-center">
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                    <span className="text-slate-400">Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-slate-500" />
                    <span className="text-slate-400">Click to upload files</span>
                    <span className="text-xs text-slate-500">Documents, images, PDFs</span>
                  </>
                )}
              </label>
            </div>
            {formData.attachment_urls.length > 0 && (
              <div className="space-y-2">
                {formData.attachment_urls.map((url, idx) => {
                  const name = formData.attachment_names[idx] || `File ${idx + 1}`;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50"
                    >
                      {isImage ? (
                        <Image className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <File className="h-5 w-5 text-blue-400" />
                      )}
                      <span className="flex-1 text-white truncate">{name}</span>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        View
                      </a>
                      <button
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reporting */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Reporting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">DEX Reportable</Label>
                <p className="text-sm text-slate-400">Mark if this note counts for DEX stage engagement</p>
              </div>
              <Switch
                checked={formData.is_billable_for_dex}
                onCheckedChange={(checked) => updateField('is_billable_for_dex', checked)}
              />
            </div>

            {formData.is_billable_for_dex && (
              <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 border border-slate-700/60">
                <Checkbox
                  checked={formData.mentoring_engagement}
                  onCheckedChange={(checked) => updateField('mentoring_engagement', !!checked)}
                />
                <div>
                  <div className="text-white text-sm">Mentoring Engagement</div>
                  <div className="text-slate-400 text-xs">
                    If the participant is currently in Employment, tick this to record a Mentoring Engagement (otherwise Employment Engagement).
                  </div>
                </div>
              </label>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link to={preselectedParticipantId
            ? createPageUrl(`ParticipantDetail?id=${preselectedParticipantId}`)
            : createPageUrl('Dashboard')
          }>
            <Button type="button" variant="outline" className="border-slate-700">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700"
            disabled={saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Create')} Case Note
          </Button>
        </div>
      </form>
    </div>
  );
}
