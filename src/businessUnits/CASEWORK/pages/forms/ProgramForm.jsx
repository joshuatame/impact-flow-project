import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Building2,
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Target
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

export default function ProgramForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const programId = urlParams.get('id');
  const isEditing = !!programId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    program_name: '',
    contract_code: '',
    funder_name: '',
    start_date: '',
    end_date: '',
    target_cohort_description: '',
    location: '',
    total_funding_amount: '',
    budget_categories: [],
    kpis: [],
    dex_reporting_required: false,
    status: 'Active'
  });

  const [intakes, setIntakes] = useState([]);

  const { data: existingProgram, isLoading: loadingProgram } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => base44.entities.Program.filter({ id: programId }),
    select: (data) => data[0],
    enabled: isEditing,
  });

  const { data: existingIntakes = [] } = useQuery({
    queryKey: ['intakes', programId],
    queryFn: () => base44.entities.ProgramIntake.filter({ program_id: programId }),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingProgram) {
      setFormData({
        program_name: existingProgram.program_name || '',
        contract_code: existingProgram.contract_code || '',
        funder_name: existingProgram.funder_name || '',
        start_date: existingProgram.start_date || '',
        end_date: existingProgram.end_date || '',
        target_cohort_description: existingProgram.target_cohort_description || '',
        location: existingProgram.location || '',
        total_funding_amount: existingProgram.total_funding_amount || '',
        budget_categories: existingProgram.budget_categories || [],
        kpis: existingProgram.kpis || [],
        dex_reporting_required: existingProgram.dex_reporting_required || false,
        status: existingProgram.status || 'Active'
      });
    }
  }, [existingProgram]);

  useEffect(() => {
    if (existingIntakes.length > 0) {
      setIntakes(existingIntakes.map(i => ({ ...i, isExisting: true })));
    }
  }, [existingIntakes]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        total_funding_amount: data.total_funding_amount ? Number(data.total_funding_amount) : null
      };
      
      let savedProgramId;
      if (isEditing) {
        await base44.entities.Program.update(programId, payload);
        savedProgramId = programId;
      } else {
        const result = await base44.entities.Program.create(payload);
        savedProgramId = result.id;
      }

      // Save intakes
      for (const intake of intakes) {
        if (intake.isExisting) {
          await base44.entities.ProgramIntake.update(intake.id, {
            intake_name: intake.intake_name,
            start_date: intake.start_date,
            end_date: intake.end_date,
            max_participants: intake.max_participants ? Number(intake.max_participants) : null,
            status: intake.status
          });
        } else if (!intake.isDeleted) {
          await base44.entities.ProgramIntake.create({
            program_id: savedProgramId,
            intake_name: intake.intake_name,
            start_date: intake.start_date,
            end_date: intake.end_date,
            max_participants: intake.max_participants ? Number(intake.max_participants) : null,
            status: intake.status || 'Upcoming'
          });
        }
      }

      return { id: savedProgramId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(['programs']);
      queryClient.invalidateQueries(['program', programId]);
      queryClient.invalidateQueries(['intakes']);
      window.location.href = createPageUrl(`ProgramDetail?id=${result.id}`);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addBudgetCategory = () => {
    setFormData(prev => ({
      ...prev,
      budget_categories: [...prev.budget_categories, { category: '', amount: '' }]
    }));
  };

  const updateBudgetCategory = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      budget_categories: prev.budget_categories.map((cat, i) => 
        i === index ? { ...cat, [field]: field === 'amount' ? Number(value) : value } : cat
      )
    }));
  };

  const removeBudgetCategory = (index) => {
    setFormData(prev => ({
      ...prev,
      budget_categories: prev.budget_categories.filter((_, i) => i !== index)
    }));
  };

  // KPI functions
  const kpiMetricTypes = [
    { value: 'participants_enrolled', label: 'Participants Enrolled' },
    { value: 'training_completed', label: 'Training Completions' },
    { value: 'employment_outcomes', label: 'Employment Outcomes' },
    { value: 'employment_sustained', label: 'Employment Sustained (26 weeks)' },
    { value: 'case_notes', label: 'Case Notes Recorded' },
    { value: 'surveys_completed', label: 'Surveys Completed' },
  ];

  const addKPI = () => {
    setFormData(prev => ({
      ...prev,
      kpis: [...prev.kpis, { name: '', metric_type: 'participants_enrolled', target_value: '' }]
    }));
  };

  const updateKPI = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      kpis: prev.kpis.map((kpi, i) => 
        i === index ? { ...kpi, [field]: field === 'target_value' ? Number(value) : value } : kpi
      )
    }));
  };

  const removeKPI = (index) => {
    setFormData(prev => ({
      ...prev,
      kpis: prev.kpis.filter((_, i) => i !== index)
    }));
  };

  // Intake functions
  const addIntake = () => {
    setIntakes(prev => [...prev, { 
      intake_name: '', 
      start_date: '', 
      end_date: '', 
      max_participants: '',
      status: 'Upcoming',
      isNew: true 
    }]);
  };

  const updateIntake = (index, field, value) => {
    setIntakes(prev => prev.map((intake, i) => 
      i === index ? { ...intake, [field]: value } : intake
    ));
  };

  const removeIntake = (index) => {
    setIntakes(prev => {
      const intake = prev[index];
      if (intake.isExisting) {
        // Mark for deletion but keep in array
        return prev.map((i, idx) => idx === index ? { ...i, isDeleted: true } : i);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  if (isEditing && loadingProgram) {
    return <LoadingSpinner />;
  }

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      <Link 
        to={isEditing ? createPageUrl(`ProgramDetail?id=${programId}`) : createPageUrl('Programs')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
        {isEditing ? 'Edit Program' : 'Add New Program'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Program Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Program Name *</Label>
                <Input
                  value={formData.program_name}
                  onChange={(e) => updateField('program_name', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-slate-300">Contract Code *</Label>
                <Input
                  value={formData.contract_code}
                  onChange={(e) => updateField('contract_code', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Funder Name</Label>
                <Input
                  value={formData.funder_name}
                  onChange={(e) => updateField('funder_name', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Location</Label>
                <Input
                  value={formData.location}
                  onChange={(e) => updateField('location', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => updateField('start_date', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => updateField('end_date', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Status</Label>
                <Select value={formData.status} onValueChange={(v) => updateField('status', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['Active', 'Inactive', 'Completed'].map(opt => (
                      <SelectItem key={opt} value={opt} className="text-white">{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Target Cohort Description</Label>
              <Textarea
                value={formData.target_cohort_description}
                onChange={(e) => updateField('target_cohort_description', e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Funding */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Funding & Budget
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Total Funding Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.total_funding_amount}
                onChange={(e) => updateField('total_funding_amount', e.target.value)}
                className="bg-slate-800 border-slate-700 text-white max-w-xs"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-slate-300">Budget Categories</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={addBudgetCategory}
                  className="border-slate-700"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Category
                </Button>
              </div>
              {formData.budget_categories.length > 0 ? (
                <div className="space-y-2">
                  {formData.budget_categories.map((cat, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Input
                        placeholder="Category name"
                        value={cat.category}
                        onChange={(e) => updateBudgetCategory(idx, 'category', e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={cat.amount}
                        onChange={(e) => updateBudgetCategory(idx, 'amount', e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white w-32"
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeBudgetCategory(idx)}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No budget categories added</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Intakes */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Program Intakes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-400">Define intake cohorts for this program</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={addIntake}
                className="border-slate-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Intake
              </Button>
            </div>
            {intakes.filter(i => !i.isDeleted).length > 0 ? (
              <div className="space-y-4">
                {intakes.filter(i => !i.isDeleted).map((intake, idx) => (
                  <div key={idx} className="p-4 bg-slate-800/50 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-300">Intake {idx + 1}</span>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="icon"
                        onClick={() => removeIntake(intakes.indexOf(intake))}
                        className="text-slate-400 hover:text-red-400 h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-slate-400 text-xs">Intake Name</Label>
                        <Input
                          placeholder="e.g., Intake 1 - Feb 2024"
                          value={intake.intake_name}
                          onChange={(e) => updateIntake(intakes.indexOf(intake), 'intake_name', e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Max Participants</Label>
                        <Input
                          type="number"
                          placeholder="e.g., 20"
                          value={intake.max_participants}
                          onChange={(e) => updateIntake(intakes.indexOf(intake), 'max_participants', e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-slate-400 text-xs">Start Date</Label>
                        <Input
                          type="date"
                          value={intake.start_date}
                          onChange={(e) => updateIntake(intakes.indexOf(intake), 'start_date', e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">End Date</Label>
                        <Input
                          type="date"
                          value={intake.end_date}
                          onChange={(e) => updateIntake(intakes.indexOf(intake), 'end_date', e.target.value)}
                          className="bg-slate-800 border-slate-700 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-400 text-xs">Status</Label>
                        <Select 
                          value={intake.status} 
                          onValueChange={(v) => updateIntake(intakes.indexOf(intake), 'status', v)}
                        >
                          <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {['Upcoming', 'Open', 'In Progress', 'Completed', 'Cancelled'].map(opt => (
                              <SelectItem key={opt} value={opt} className="text-white">{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No intakes added yet</p>
            )}
          </CardContent>
        </Card>

        {/* KPIs */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="h-5 w-5" />
              Key Performance Indicators (KPIs)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-400">Set targets to track program performance</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={addKPI}
                className="border-slate-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add KPI
              </Button>
            </div>
            {formData.kpis.length > 0 ? (
              <div className="space-y-3">
                {formData.kpis.map((kpi, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="KPI Name"
                        value={kpi.name}
                        onChange={(e) => updateKPI(idx, 'name', e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                      <Select value={kpi.metric_type} onValueChange={(v) => updateKPI(idx, 'metric_type', v)}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {kpiMetricTypes.map(type => (
                            <SelectItem key={type.value} value={type.value} className="text-white">
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Target"
                        value={kpi.target_value}
                        onChange={(e) => updateKPI(idx, 'target_value', e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeKPI(idx)}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No KPIs added yet</p>
            )}
          </CardContent>
        </Card>

        {/* Settings */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Reporting Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-white">DEX Reporting Required</Label>
                <p className="text-sm text-slate-400">Enable if this program requires DEX exports</p>
              </div>
              <Switch
                checked={formData.dex_reporting_required}
                onCheckedChange={(checked) => updateField('dex_reporting_required', checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Link to={isEditing ? createPageUrl(`ProgramDetail?id=${programId}`) : createPageUrl('Programs')}>
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
            {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Create')} Program
          </Button>
        </div>
      </form>
    </div>
  );
}