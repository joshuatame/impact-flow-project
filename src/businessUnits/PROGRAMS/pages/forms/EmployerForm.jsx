import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Save,
  Building2,
  MapPin,
  User,
  Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

const defaultIndustries = [
  'Construction',
  'Retail',
  'Hospitality',
  'Healthcare',
  'Manufacturing',
  'Transport & Logistics',
  'Agriculture',
  'Mining',
  'Education',
  'Professional Services',
  'Government',
  'Other'
];

export default function EmployerForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const employerId = urlParams.get('id');
  const isEditing = !!employerId;
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    company_name: '',
    abn: '',
    industry_type: '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    website: '',
    primary_contact_name: '',
    primary_contact_phone: '',
    primary_contact_email: '',
    secondary_contact_name: '',
    secondary_contact_phone: '',
    relationship_status: 'Active',
    notes: '',
    partnership_start_date: ''
  });

  const { data: existingEmployer, isLoading } = useQuery({
    queryKey: ['employer', employerId],
    queryFn: () => base44.entities.Employer.filter({ id: employerId }),
    select: (data) => data[0],
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingEmployer) {
      setFormData({
        company_name: existingEmployer.company_name || '',
        abn: existingEmployer.abn || '',
        industry_type: existingEmployer.industry_type || '',
        address: existingEmployer.address || '',
        suburb: existingEmployer.suburb || '',
        state: existingEmployer.state || '',
        postcode: existingEmployer.postcode || '',
        website: existingEmployer.website || '',
        primary_contact_name: existingEmployer.primary_contact_name || '',
        primary_contact_phone: existingEmployer.primary_contact_phone || '',
        primary_contact_email: existingEmployer.primary_contact_email || '',
        secondary_contact_name: existingEmployer.secondary_contact_name || '',
        secondary_contact_phone: existingEmployer.secondary_contact_phone || '',
        relationship_status: existingEmployer.relationship_status || 'Active',
        notes: existingEmployer.notes || '',
        partnership_start_date: existingEmployer.partnership_start_date || ''
      });
    }
  }, [existingEmployer]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (isEditing) {
        return base44.entities.Employer.update(employerId, data);
      } else {
        return base44.entities.Employer.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['employers']);
      window.location.href = createPageUrl('EmployerAcademy');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isEditing && isLoading) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
      <Link 
        to={createPageUrl('EmployerAcademy')}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Employers
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">
        {isEditing ? 'Edit Employer' : 'Add New Employer'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Company Name *</Label>
                <Input
                  value={formData.company_name}
                  onChange={(e) => updateField('company_name', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
              </div>
              <div>
                <Label className="text-slate-300">ABN</Label>
                <Input
                  value={formData.abn}
                  onChange={(e) => updateField('abn', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Industry Type</Label>
                <Select value={formData.industry_type} onValueChange={(v) => updateField('industry_type', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {defaultIndustries.map(ind => (
                      <SelectItem key={ind} value={ind} className="text-white">{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Relationship Status</Label>
                <Select value={formData.relationship_status} onValueChange={(v) => updateField('relationship_status', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['Active', 'Inactive', 'Prospect', 'Former'].map(s => (
                      <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                  placeholder="https://"
                />
              </div>
              <div>
                <Label className="text-slate-300">Partnership Start Date</Label>
                <Input
                  type="date"
                  value={formData.partnership_start_date}
                  onChange={(e) => updateField('partnership_start_date', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-300">Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Suburb</Label>
                <Input
                  value={formData.suburb}
                  onChange={(e) => updateField('suburb', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">State</Label>
                <Select value={formData.state} onValueChange={(v) => updateField('state', v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(s => (
                      <SelectItem key={s} value={s} className="text-white">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Postcode</Label>
                <Input
                  value={formData.postcode}
                  onChange={(e) => updateField('postcode', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <User className="h-5 w-5" />
              Key Contacts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Primary Contact Name</Label>
                <Input
                  value={formData.primary_contact_name}
                  onChange={(e) => updateField('primary_contact_name', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Phone</Label>
                <Input
                  value={formData.primary_contact_phone}
                  onChange={(e) => updateField('primary_contact_phone', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Email</Label>
                <Input
                  type="email"
                  value={formData.primary_contact_email}
                  onChange={(e) => updateField('primary_contact_email', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Secondary Contact Name</Label>
                <Input
                  value={formData.secondary_contact_name}
                  onChange={(e) => updateField('secondary_contact_name', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Phone</Label>
                <Input
                  value={formData.secondary_contact_phone}
                  onChange={(e) => updateField('secondary_contact_phone', e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="bg-slate-800 border-slate-700 text-white min-h-[100px]"
              placeholder="Additional notes about this employer..."
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Link to={createPageUrl('EmployerAcademy')}>
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
            {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Create')} Employer
          </Button>
        </div>
      </form>
    </div>
  );
}