import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  ClipboardList,
  FileQuestion
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

export default function SurveyBuilder() {
  const urlParams = new URLSearchParams(window.location.search);
  const surveyId = urlParams.get('id');
  const isEditing = !!surveyId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true,
    survey_type: 'domain_based',
    domains: [],
    questions: []
  });

  const { data: existingSurvey, isLoading } = useQuery({
    queryKey: ['surveyTemplate', surveyId],
    queryFn: () => base44.entities.SurveyTemplate.filter({ id: surveyId }),
    select: (data) => data[0],
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingSurvey) {
      setFormData({
        name: existingSurvey.name || '',
        description: existingSurvey.description || '',
        is_active: existingSurvey.is_active ?? true,
        survey_type: existingSurvey.survey_type || 'domain_based',
        domains: existingSurvey.domains || [],
        questions: existingSurvey.questions || []
      });
    }
  }, [existingSurvey]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return base44.entities.SurveyTemplate.update(surveyId, data);
      } else {
        return base44.entities.SurveyTemplate.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['surveyTemplates']);
      window.location.href = createPageUrl('Admin');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const addDomain = () => {
    setFormData(prev => ({
      ...prev,
      domains: [...prev.domains, {
        domain_name: '',
        domain_description: '',
        questions: [],
        max_domain_score: 10
      }]
    }));
  };

  const updateDomain = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains.map((d, i) => 
        i === index ? { ...d, [field]: value } : d
      )
    }));
  };

  const removeDomain = (index) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains.filter((_, i) => i !== index)
    }));
  };

  const addQuestion = (domainIndex) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains.map((d, i) => 
        i === domainIndex ? {
          ...d,
          questions: [...d.questions, {
            question_id: `q_${Date.now()}`,
            question_text: '',
            question_type: 'scale',
            options: ['1', '2', '3', '4', '5'],
            max_score: 5
          }]
        } : d
      )
    }));
  };

  const updateQuestion = (domainIndex, questionIndex, field, value) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains.map((d, i) => 
        i === domainIndex ? {
          ...d,
          questions: d.questions.map((q, qi) =>
            qi === questionIndex ? { ...q, [field]: value } : q
          )
        } : d
      )
    }));
  };

  const removeQuestion = (domainIndex, questionIndex) => {
    setFormData(prev => ({
      ...prev,
      domains: prev.domains.map((d, i) => 
        i === domainIndex ? {
          ...d,
          questions: d.questions.filter((_, qi) => qi !== questionIndex)
        } : d
      )
    }));
  };

  if (isEditing && isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      <Link 
        to={createPageUrl('Admin')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Admin
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
        {isEditing ? 'Edit Survey Template' : 'Create Survey Template'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Survey Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Survey Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="e.g., Intake Assessment Survey"
                required
              />
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
                placeholder="Describe the purpose of this survey..."
                rows={2}
              />
            </div>
            <div>
              <Label className="text-slate-300">Survey Type</Label>
              <Select value={formData.survey_type} onValueChange={(v) => setFormData({...formData, survey_type: v})}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="domain_based" className="text-white">Domain-Based (LSI-R Style)</SelectItem>
                  <SelectItem value="simple" className="text-white">Simple Survey</SelectItem>
                  <SelectItem value="feedback" className="text-white">Feedback Form</SelectItem>
                  <SelectItem value="assessment" className="text-white">Skills Assessment</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                {formData.survey_type === 'domain_based' && 'Grouped questions by domain with scoring'}
                {formData.survey_type === 'simple' && 'Simple list of questions without domains'}
                {formData.survey_type === 'feedback' && 'Feedback collection form'}
                {formData.survey_type === 'assessment' && 'Skills or competency assessment'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">Active</Label>
                <p className="text-sm text-slate-400">Survey can be used for assessments</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
              />
            </div>
          </CardContent>
        </Card>

        {/* Simple Questions (for non-domain types) */}
        {formData.survey_type !== 'domain_based' && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>Questions</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    questions: [...prev.questions, {
                      question_id: `q_${Date.now()}`,
                      question_text: '',
                      question_type: 'text',
                      options: [],
                      required: false
                    }]
                  }))}
                  className="border-slate-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.questions?.map((question, idx) => (
                <div key={idx} className="p-4 bg-slate-800/50 rounded-lg space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-slate-500 text-sm mt-2">{idx + 1}.</span>
                    <div className="flex-1 space-y-3">
                      <Input
                        value={question.question_text}
                        onChange={(e) => {
                          const updated = [...formData.questions];
                          updated[idx].question_text = e.target.value;
                          setFormData({...formData, questions: updated});
                        }}
                        className="bg-slate-700 border-slate-600 text-white"
                        placeholder="Enter question"
                      />
                      <div className="flex gap-3">
                        <Select 
                          value={question.question_type}
                          onValueChange={(v) => {
                            const updated = [...formData.questions];
                            updated[idx].question_type = v;
                            setFormData({...formData, questions: updated});
                          }}
                        >
                          <SelectTrigger className="w-40 bg-slate-700 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            <SelectItem value="text" className="text-white">Text</SelectItem>
                            <SelectItem value="scale" className="text-white">Scale (1-5)</SelectItem>
                            <SelectItem value="yes_no" className="text-white">Yes/No</SelectItem>
                            <SelectItem value="multiple_choice" className="text-white">Multiple Choice</SelectItem>
                            <SelectItem value="rating" className="text-white">Rating (1-10)</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const updated = formData.questions.filter((_, i) => i !== idx);
                            setFormData({...formData, questions: updated});
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {formData.questions?.length === 0 && (
                <p className="text-center text-slate-500 py-8">No questions yet. Add your first question above.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Domains (for domain-based surveys) */}
        {formData.survey_type === 'domain_based' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Domains</h2>
            <Button type="button" onClick={addDomain} variant="outline" className="border-slate-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </div>

          {formData.domains.map((domain, domainIndex) => (
            <Card key={domainIndex} className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-white text-base">Domain {domainIndex + 1}</CardTitle>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDomain(domainIndex)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-slate-300">Domain Name</Label>
                    <Input
                      value={domain.domain_name}
                      onChange={(e) => updateDomain(domainIndex, 'domain_name', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                      placeholder="e.g., Education/Employment"
                    />
                  </div>
                  <div>
                    <Label className="text-slate-300">Max Score</Label>
                    <Input
                      type="number"
                      value={domain.max_domain_score}
                      onChange={(e) => updateDomain(domainIndex, 'max_domain_score', Number(e.target.value))}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-slate-300">Description</Label>
                  <Input
                    value={domain.domain_description}
                    onChange={(e) => updateDomain(domainIndex, 'domain_description', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                    placeholder="Brief description of this domain"
                  />
                </div>

                {/* Questions */}
                <div className="border-t border-slate-800 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-slate-300">Questions</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addQuestion(domainIndex)}
                      className="text-blue-400"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Question
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {domain.questions.map((question, questionIndex) => (
                      <div key={questionIndex} className="p-3 bg-slate-800/50 rounded-lg">
                        <div className="flex items-start gap-3">
                          <FileQuestion className="h-4 w-4 text-slate-500 mt-2" />
                          <div className="flex-1 space-y-2">
                            <Input
                              value={question.question_text}
                              onChange={(e) => updateQuestion(domainIndex, questionIndex, 'question_text', e.target.value)}
                              className="bg-slate-700 border-slate-600 text-white"
                              placeholder="Enter question text"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Select 
                                value={question.question_type} 
                                onValueChange={(v) => updateQuestion(domainIndex, questionIndex, 'question_type', v)}
                              >
                                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-slate-700">
                                  <SelectItem value="scale" className="text-white">Scale (1-5)</SelectItem>
                                  <SelectItem value="yes_no" className="text-white">Yes/No</SelectItem>
                                  <SelectItem value="text" className="text-white">Text</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                value={question.max_score}
                                onChange={(e) => updateQuestion(domainIndex, questionIndex, 'max_score', Number(e.target.value))}
                                className="bg-slate-700 border-slate-600 text-white"
                                placeholder="Max score"
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQuestion(domainIndex, questionIndex)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {domain.questions.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-4">
                        No questions yet. Click "Add Question" to start.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {formData.domains.length === 0 && (
            <Card className="bg-slate-900/50 border-slate-800 border-dashed">
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-4">No domains yet. Add domains to structure your survey.</p>
                <Button type="button" onClick={addDomain} variant="outline" className="border-slate-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Domain
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link to={createPageUrl('Admin')}>
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
            {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Create')} Survey
          </Button>
        </div>
      </form>
    </div>
  );
}