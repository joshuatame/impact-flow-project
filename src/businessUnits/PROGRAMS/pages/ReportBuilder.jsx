import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  BarChart3,
  PieChart,
  LineChart as LineChartIcon,
  Table,
  Play,
  Plus,
  Trash2
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import PageHeader from '@/components/ui/PageHeader.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e', '#84cc16'];

const chartTypes = [
  { id: 'bar', name: 'Bar', icon: BarChart3 },
  { id: 'line', name: 'Line', icon: LineChartIcon },
  { id: 'pie', name: 'Pie', icon: PieChart },
  { id: 'area', name: 'Area', icon: LineChartIcon },
  { id: 'table', name: 'Table', icon: Table },
];

const dataSources = [
  { id: 'Participant', name: 'Participants', fields: ['status', 'current_phase', 'gender', 'indigenous_status', 'state'] },
  { id: 'CaseNote', name: 'Case Notes', fields: ['note_type', 'sensitivity_level', 'location'] },
  { id: 'EmploymentPlacement', name: 'Employment', fields: ['status', 'employment_type', 'employer_name'] },
  { id: 'ParticipantTraining', name: 'Training', fields: ['outcome'] },
  { id: 'FundingRecord', name: 'Funding', fields: ['category', 'record_type'], numericFields: ['amount'] },
  { id: 'SurveyResponse', name: 'Surveys', fields: ['overall_risk_band'], numericFields: ['overall_score'] },
  { id: 'Program', name: 'Programs', fields: ['status'], numericFields: ['total_funding_amount'] },
];

export default function ReportBuilder() {
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_shared: false,
    charts: []
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: existingReport, isLoading: loadingReport } = useQuery({
    queryKey: ['customReport', reportId],
    queryFn: () => base44.entities.CustomReport.filter({ id: reportId }),
    select: (data) => data[0],
    enabled: !!reportId,
  });

  useEffect(() => {
    if (existingReport) {
      setFormData({
        name: existingReport.name || '',
        description: existingReport.description || '',
        is_shared: existingReport.is_shared || false,
        charts: existingReport.charts || []
      });
    }
  }, [existingReport]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        created_by_id: user?.id
      };
      if (reportId) {
        return base44.entities.CustomReport.update(reportId, payload);
      } else {
        return base44.entities.CustomReport.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['customReports']);
      window.location.href = createPageUrl('Reports');
    }
  });

  const addChart = () => {
    const newChart = {
      chart_id: `chart_${Date.now()}`,
      title: `Chart ${formData.charts.length + 1}`,
      chart_type: 'bar',
      data_source: 'Participant',
      group_by: 'status',
      aggregate: 'count',
      aggregate_field: ''
    };
    setFormData({
      ...formData,
      charts: [...formData.charts, newChart]
    });
  };

  const updateChart = (chartId, field, value) => {
    setFormData({
      ...formData,
      charts: formData.charts.map(c => 
        c.chart_id === chartId ? { ...c, [field]: value } : c
      )
    });
  };

  const removeChart = (chartId) => {
    setFormData({
      ...formData,
      charts: formData.charts.filter(c => c.chart_id !== chartId)
    });
  };

  if (loadingReport) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-6xl mx-auto">
      <Link 
        to={createPageUrl('Reports')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
        {reportId ? 'Edit Report' : 'Create Multi-Chart Report'}
      </h1>

      <div className="space-y-6">
        {/* Report Settings */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Report Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Report Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div className="flex items-center gap-4 pt-6">
                <Switch
                  checked={formData.is_shared}
                  onCheckedChange={(checked) => setFormData({...formData, is_shared: checked})}
                />
                <Label className="text-white">Share with team</Label>
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="bg-slate-800 border-slate-700 text-white"
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Charts ({formData.charts.length})</h2>
          <Button onClick={addChart} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Chart
          </Button>
        </div>

        {formData.charts.map((chart, idx) => {
          const currentSource = dataSources.find(d => d.id === chart.data_source);
          return (
            <Card key={chart.chart_id} className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <Input
                  value={chart.title}
                  onChange={(e) => updateChart(chart.chart_id, 'title', e.target.value)}
                  className="bg-transparent border-none text-white text-lg font-semibold p-0 h-auto"
                  placeholder="Chart Title"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeChart(chart.chart_id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {chartTypes.map(type => (
                    <button
                      key={type.id}
                      onClick={() => updateChart(chart.chart_id, 'chart_type', type.id)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                        chart.chart_type === type.id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <type.icon className="h-4 w-4" />
                      <span className="text-xs">{type.name}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-slate-300">Data Source</Label>
                    <Select 
                      value={chart.data_source || 'Participant'} 
                      onValueChange={(v) => {
                        const newSource = dataSources.find(d => d.id === v);
                        setFormData(prev => ({
                          ...prev,
                          charts: prev.charts.map(c => 
                            c.chart_id === chart.chart_id 
                              ? { ...c, data_source: v, group_by: newSource?.fields[0] || '' } 
                              : c
                          )
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {dataSources.map(ds => (
                          <SelectItem key={ds.id} value={ds.id} className="text-white">{ds.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Group By</Label>
                    <Select 
                      value={chart.group_by || ''} 
                      onValueChange={(v) => {
                        setFormData(prev => ({
                          ...prev,
                          charts: prev.charts.map(c => 
                            c.chart_id === chart.chart_id ? { ...c, group_by: v } : c
                          )
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        {currentSource?.fields.map(f => (
                          <SelectItem key={f} value={f} className="text-white">{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-slate-300">Aggregation</Label>
                    <Select 
                      value={chart.aggregate || 'count'} 
                      onValueChange={(v) => {
                        setFormData(prev => ({
                          ...prev,
                          charts: prev.charts.map(c => 
                            c.chart_id === chart.chart_id ? { ...c, aggregate: v } : c
                          )
                        }));
                      }}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Select aggregation" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700">
                        <SelectItem value="count" className="text-white">Count</SelectItem>
                        {currentSource?.numericFields && (
                          <>
                            <SelectItem value="sum" className="text-white">Sum</SelectItem>
                            <SelectItem value="average" className="text-white">Average</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {formData.charts.length === 0 && (
          <Card className="bg-slate-900/50 border-slate-800 border-dashed">
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 mb-4">No charts yet. Add charts to build your report.</p>
              <Button onClick={addChart} variant="outline" className="border-slate-700">
                <Plus className="h-4 w-4 mr-2" />
                Add First Chart
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Link to={createPageUrl('Reports')}>
            <Button variant="outline" className="border-slate-700">Cancel</Button>
          </Link>
          <Button 
            onClick={() => saveMutation.mutate(formData)}
            disabled={!formData.name || formData.charts.length === 0 || saveMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Report'}
          </Button>
        </div>
      </div>
    </div>
  );
}