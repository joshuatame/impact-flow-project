import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  ClipboardList,
  CheckCircle,
  Circle,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

// Survey sections - each totals to part of 100
export const SURVEY_SECTIONS = [
  {
    section_id: "criminal_history",
    section_name: "Criminal History",
    section_description: "Prior involvement with the justice system",
    max_points: 10,
    questions: [
      { question_id: "ch1", question_text: "Overall criminal history (charges/convictions).", options: ["None", "Minor/limited", "Moderate", "Extensive/serious"], max_score: 3 },
      { question_id: "ch2", question_text: "Age at first justice involvement.", options: ["Never", "Adult (18+)", "15–17", "Under 15"], max_score: 3 },
      { question_id: "ch3", question_text: "History of custodial sentences (remand/prison).", options: ["None", "Short/one-off", "Multiple/periodic", "Frequent/long-term"], max_score: 3 },
      { question_id: "ch4", question_text: "History of violent offences.", options: ["None", "Past only (low severity)", "Occasional/ongoing risk", "Frequent/severe"], max_score: 3 },
      { question_id: "ch5", question_text: "History of breaches (bail/parole/IO/conditions).", options: ["None", "One minor breach", "Multiple breaches", "Frequent/non-compliant"], max_score: 3 },
      { question_id: "ch6", question_text: "Current legal matters outstanding.", options: ["None", "Minor/low risk", "Moderate", "Serious/high risk"], max_score: 3 },
      { question_id: "ch7", question_text: "Compliance with appointments/requirements.", options: ["Consistently compliant", "Mostly compliant", "Sometimes misses", "Often non-compliant"], max_score: 3 },
      { question_id: "ch8", question_text: "Pattern of offending in last 12 months.", options: ["None", "Isolated incident(s)", "Recurring", "Escalating/frequent"], max_score: 3 },
    ]
  },
  {
    section_id: "education_employment",
    section_name: "Education/Employment",
    section_description: "Educational background and employment history",
    max_points: 15,
    questions: [
      { question_id: "ee1", question_text: "Highest completed education level.", options: ["Tertiary/TAFE completed", "Year 12 completed", "Year 10–11", "Below Year 10"], max_score: 3 },
      { question_id: "ee2", question_text: "Employment history over the past 2 years.", options: ["Stable employment", "Mostly employed", "Intermittent", "Unemployed"], max_score: 3 },
      { question_id: "ee3", question_text: "Current work/study engagement.", options: ["Full-time", "Part-time/casual", "Occasional/unstable", "Not engaged"], max_score: 3 },
      { question_id: "ee4", question_text: "Attendance/reliability (work/study).", options: ["Reliable", "Mostly reliable", "Often late/absent", "Frequently absent"], max_score: 3 },
      { question_id: "ee5", question_text: "Marketable skills/qualifications.", options: ["Strong/recognised", "Some", "Limited", "None/very limited"], max_score: 3 },
      { question_id: "ee6", question_text: "Barriers to employment (health, transport, childcare).", options: ["None/minimal", "Some manageable", "Significant", "Severe/unmanaged"], max_score: 3 },
      { question_id: "ee7", question_text: "Job search effort (if unemployed).", options: ["Active and consistent", "Some effort", "Minimal effort", "None/refuses"], max_score: 3 },
      { question_id: "ee8", question_text: "Workplace behaviour/discipline history.", options: ["No issues", "Minor issues", "Repeated issues", "Serious/terminated often"], max_score: 3 },
    ]
  },
  {
    section_id: "financial",
    section_name: "Financial",
    section_description: "Financial stability and money management",
    max_points: 10,
    questions: [
      { question_id: "f1", question_text: "Ability to manage money/budgeting.", options: ["Good budgeting", "Mostly manages", "Struggles", "Chaotic/no budgeting"], max_score: 3 },
      { question_id: "f2", question_text: "Current financial stress (bills/arrears).", options: ["Low", "Some stress", "High", "Severe/crisis"], max_score: 3 },
      { question_id: "f3", question_text: "Debt level (excluding mortgage).", options: ["None/low", "Manageable", "High", "Unmanageable"], max_score: 3 },
      { question_id: "f4", question_text: "Reliance on emergency support (loans/charity).", options: ["Never", "Rare", "Sometimes", "Frequent"], max_score: 3 },
      { question_id: "f5", question_text: "Stable income source.", options: ["Stable and adequate", "Stable but low", "Unstable", "No reliable income"], max_score: 3 },
      { question_id: "f6", question_text: "History of financial misconduct (fraud/theft).", options: ["None", "Past only", "Occasional/ongoing risk", "Frequent/ongoing"], max_score: 3 },
      { question_id: "f7", question_text: "Gambling impact on finances.", options: ["No impact", "Minor", "Moderate", "Severe"], max_score: 3 },
      { question_id: "f8", question_text: "Housing affordability risk.", options: ["Affordable", "Some risk", "High risk", "Imminent loss"], max_score: 3 },
    ]
  },
  {
    section_id: "family_marital",
    section_name: "Family/Marital",
    section_description: "Family relationships, support and conflict",
    max_points: 10,
    questions: [
      { question_id: "fm1", question_text: "Quality of close family relationships.", options: ["Supportive", "Mostly supportive", "Strained", "Conflict/hostile"], max_score: 3 },
      { question_id: "fm2", question_text: "Domestic conflict/violence risk.", options: ["None", "Past only", "Occasional/ongoing risk", "Frequent/high risk"], max_score: 3 },
      { question_id: "fm3", question_text: "Partner relationship stability (if applicable).", options: ["Stable", "Some stress", "Unstable", "High conflict/ended often"], max_score: 3 },
      { question_id: "fm4", question_text: "Parenting/caring responsibilities stability.", options: ["Stable", "Some challenges", "Significant challenges", "Chaotic/unmanaged"], max_score: 3 },
      { question_id: "fm5", question_text: "Family involvement in pro-social activities.", options: ["Active pro-social involvement", "Some involvement", "Rare involvement", "None/negative influence"], max_score: 3 },
      { question_id: "fm6", question_text: "Family members involved in crime/substance misuse.", options: ["None", "Limited", "Several", "Most/strong influence"], max_score: 3 },
      { question_id: "fm7", question_text: "Social support available in crisis.", options: ["Strong support", "Some support", "Limited support", "None"], max_score: 3 },
      { question_id: "fm8", question_text: "Communication/problem-solving within family.", options: ["Effective", "Mostly effective", "Often ineffective", "Consistently ineffective"], max_score: 3 },
    ]
  },
  {
    section_id: "accommodation",
    section_name: "Accommodation",
    section_description: "Housing stability and suitability",
    max_points: 10,
    questions: [
      { question_id: "a1", question_text: "Current housing stability.", options: ["Stable long-term", "Stable short-term", "Unstable", "Homeless/temporary"], max_score: 3 },
      { question_id: "a2", question_text: "Number of moves in past 12 months.", options: ["0–1", "2", "3–4", "5+"], max_score: 3 },
      { question_id: "a3", question_text: "Safety of current living environment.", options: ["Safe", "Mostly safe", "Unsafe at times", "Unsafe/high risk"], max_score: 3 },
      { question_id: "a4", question_text: "Housing suitability (space, services, location).", options: ["Suitable", "Mostly suitable", "Poor fit", "Not suitable"], max_score: 3 },
      { question_id: "a5", question_text: "Exposure to negative influences at home.", options: ["None", "Some", "Significant", "Constant/high"], max_score: 3 },
      { question_id: "a6", question_text: "Risk of eviction/tenancy breakdown.", options: ["Low", "Some risk", "High risk", "Imminent"], max_score: 3 },
      { question_id: "a7", question_text: "Ability to maintain a tenancy (routines, upkeep).", options: ["Good", "Mostly good", "Struggles", "Cannot maintain"], max_score: 3 },
      { question_id: "a8", question_text: "Housing support plan in place (if needed).", options: ["Not needed/covered", "Some supports", "Limited supports", "None"], max_score: 3 },
    ]
  },
  {
    section_id: "leisure_recreation",
    section_name: "Leisure/Recreation",
    section_description: "Pro-social activities and structured time use",
    max_points: 10,
    questions: [
      { question_id: "lr1", question_text: "Participation in structured pro-social activities (higher score = less participation).", options: ["Regular (weekly+)", "Sometimes", "Rare", "None"], max_score: 3 },
      { question_id: "lr2", question_text: "Time spent in unstructured/idle activities (higher score = more idle time).", options: ["Low", "Some", "High", "Very high"], max_score: 3 },
      { question_id: "lr3", question_text: "Use of leisure to support wellbeing (exercise/hobbies).", options: ["Strong", "Some", "Limited", "None"], max_score: 3 },
      { question_id: "lr4", question_text: "Community connection (clubs, groups, volunteering).", options: ["Active", "Occasional", "Rare", "None"], max_score: 3 },
      { question_id: "lr5", question_text: "Association with risky activities during leisure.", options: ["None", "Low", "Moderate", "High"], max_score: 3 },
      { question_id: "lr6", question_text: "Ability to plan and maintain routines.", options: ["Consistent routines", "Mostly consistent", "Inconsistent", "Chaotic"], max_score: 3 },
      { question_id: "lr7", question_text: "Social activities are mostly pro-social.", options: ["Yes, consistently", "Mostly", "Mixed", "Mostly anti-social/risky"], max_score: 3 },
      { question_id: "lr8", question_text: "Access to positive recreational opportunities.", options: ["Good access", "Some access", "Limited access", "No access"], max_score: 3 },
      { question_id: "lr9", question_text: "Physical activity frequency per week (higher score = less activity).", options: ["4+ times", "2–3 times", "1 time", "None"], max_score: 3 },
      { question_id: "lr10", question_text: "Participation in cultural/spiritual/community events.", options: ["Regular", "Occasional", "Rare", "Never"], max_score: 3 },
      { question_id: "lr11", question_text: "Time spent with positive peers in leisure time.", options: ["Mostly positive peers", "Mixed peers", "Often negative peers", "Mostly negative peers"], max_score: 3 },
      { question_id: "lr12", question_text: "Screen time / gaming / passive media impact on daily functioning.", options: ["No impact", "Minor", "Moderate", "Severe"], max_score: 3 },
    ]
  },
  {
    section_id: "companions",
    section_name: "Companions",
    section_description: "Social network and influences",
    max_points: 5,
    questions: [
      { question_id: "c1", question_text: "Influence of close associates/peers.", options: ["Mostly positive", "Neutral/mixed", "Some negative", "Mostly negative"], max_score: 3 },
      { question_id: "c2", question_text: "Proportion of friends involved in crime.", options: ["None", "A few", "Many", "Most/all"], max_score: 3 },
      { question_id: "c3", question_text: "Exposure to substance-using peers.", options: ["None", "Occasional", "Regular", "Constant"], max_score: 3 },
      { question_id: "c4", question_text: "Pressure from peers to engage in risky behaviour.", options: ["None", "Low", "Moderate", "High"], max_score: 3 },
      { question_id: "c5", question_text: "Presence of pro-social role models/mentors.", options: ["Strong support", "Some support", "Limited", "None"], max_score: 3 },
      { question_id: "c6", question_text: "Social isolation (higher score = more isolated).", options: ["Not isolated", "Sometimes isolated", "Often isolated", "Severely isolated"], max_score: 3 },
      { question_id: "c7", question_text: "Involvement with gangs/organised groups.", options: ["None", "Past only", "Some involvement", "Active involvement"], max_score: 3 },
      { question_id: "c8", question_text: "Ability to set boundaries with negative peers.", options: ["Strong", "Mostly", "Weak", "Unable"], max_score: 3 },
      { question_id: "c9", question_text: "Contact frequency with negative peers (higher score = more contact).", options: ["Rare/none", "Monthly", "Weekly", "Daily"], max_score: 3 },
      { question_id: "c10", question_text: "Support network stability (pro-social support).", options: ["Stable", "Mostly stable", "Unstable", "None"], max_score: 3 },
      { question_id: "c11", question_text: "Participation in pro-social group activities with peers.", options: ["Regular", "Occasional", "Rare", "Never"], max_score: 3 },
      { question_id: "c12", question_text: "History of co-offending with peers.", options: ["Never", "Past only", "Occasional", "Frequent/recent"], max_score: 3 },
    ]
  },
  {
    section_id: "alcohol_drug",
    section_name: "Alcohol/Drug",
    section_description: "Substance use history and current use",
    max_points: 15,
    questions: [
      { question_id: "ad1", question_text: "Alcohol use frequency/impact (higher score = worse).", options: ["No use/no issues", "Occasional/no impact", "Regular/some impact", "Heavy/severe impact"], max_score: 3 },
      { question_id: "ad2", question_text: "Drug use frequency/impact (higher score = worse).", options: ["No use/no issues", "Occasional/no impact", "Regular/some impact", "Heavy/severe impact"], max_score: 3 },
      { question_id: "ad3", question_text: "Substance use interferes with daily functioning.", options: ["Never", "Rarely", "Sometimes", "Often"], max_score: 3 },
      { question_id: "ad4", question_text: "Cravings/loss of control.", options: ["None", "Mild", "Moderate", "Severe"], max_score: 3 },
      { question_id: "ad5", question_text: "Use in high-risk situations (driving, unsafe sex).", options: ["Never", "Rarely", "Sometimes", "Often"], max_score: 3 },
      { question_id: "ad6", question_text: "History of overdose/medical emergencies.", options: ["None", "Past only", "Occasional risk", "Multiple/recent"], max_score: 3 },
      { question_id: "ad7", question_text: "Engagement with treatment/support.", options: ["Active and consistent", "Some engagement", "Minimal", "None/refuses"], max_score: 3 },
      { question_id: "ad8", question_text: "Recent trend in use (past 3 months).", options: ["Decreased or stopped", "Stable low", "Stable moderate", "Increased"], max_score: 3 },
      { question_id: "ad9", question_text: "Poly-substance use (using multiple substances).", options: ["None", "Occasional", "Regular", "Frequent"], max_score: 3 },
      { question_id: "ad10", question_text: "Binge/intensive use episodes.", options: ["None", "Rare", "Occasional", "Frequent"], max_score: 3 },
      { question_id: "ad11", question_text: "Substance-related offending or risky behaviour.", options: ["None", "Past only", "Occasional", "Frequent/recent"], max_score: 3 },
      { question_id: "ad12", question_text: "Attendance/compliance with treatment plan (if applicable).", options: ["Consistent", "Mostly", "Sometimes", "Not at all"], max_score: 3 },
    ]
  },
  {
    section_id: "emotional_personal",
    section_name: "Emotional/Personal",
    section_description: "Mental health, coping and behavioural stability",
    max_points: 10,
    questions: [
      { question_id: "ep1", question_text: "Current mental health stability (higher score = less stable).", options: ["Stable", "Mild symptoms", "Moderate symptoms", "Severe/unstable"], max_score: 3 },
      { question_id: "ep2", question_text: "Coping skills under stress.", options: ["Strong", "Adequate", "Limited", "Very limited"], max_score: 3 },
      { question_id: "ep3", question_text: "Impulsivity and decision-making.", options: ["Low", "Some", "High", "Very high"], max_score: 3 },
      { question_id: "ep4", question_text: "Anger/aggression control.", options: ["Good control", "Mostly controlled", "Often loses control", "Frequent aggression"], max_score: 3 },
      { question_id: "ep5", question_text: "History of self-harm/suicidal behaviour.", options: ["None", "Past only", "Occasional risk", "Current/high risk"], max_score: 3 },
      { question_id: "ep6", question_text: "Trauma symptoms impacting functioning.", options: ["None", "Mild", "Moderate", "Severe"], max_score: 3 },
      { question_id: "ep7", question_text: "Engagement with mental health supports.", options: ["Consistent", "Some engagement", "Minimal", "None"], max_score: 3 },
      { question_id: "ep8", question_text: "Substance use linked to emotional distress.", options: ["Not linked", "Sometimes", "Often", "Strongly linked"], max_score: 3 },
      { question_id: "ep9", question_text: "Sleep quality and routine (higher score = worse sleep).", options: ["Good routine", "Minor issues", "Frequent issues", "Severe/no routine"], max_score: 3 },
      { question_id: "ep10", question_text: "Ability to manage anxiety/depression symptoms.", options: ["Well managed", "Mostly managed", "Poorly managed", "Unmanaged"], max_score: 3 },
      { question_id: "ep11", question_text: "Medication adherence (if prescribed).", options: ["Consistent", "Mostly", "Sometimes", "Not at all"], max_score: 3 },
      { question_id: "ep12", question_text: "Response to feedback/corrections.", options: ["Accepts and adjusts", "Usually accepts", "Often defensive", "Hostile/refuses"], max_score: 3 },
    ]
  },
  {
    section_id: "attitude_orientation",
    section_name: "Attitude/Orientation",
    section_description: "Attitudes, responsibility and motivation for change",
    max_points: 5,
    questions: [
      { question_id: "ao1", question_text: "Acceptance of responsibility for past harmful behaviour.", options: ["Full acceptance", "Mostly", "Minimises", "Denies/blames others"], max_score: 3 },
      { question_id: "ao2", question_text: "Attitudes toward rules/authority.", options: ["Respectful", "Generally cooperative", "Resistant", "Hostile/noncompliant"], max_score: 3 },
      { question_id: "ao3", question_text: "Motivation to change risk behaviours.", options: ["High", "Moderate", "Low", "None"], max_score: 3 },
      { question_id: "ao4", question_text: "Problem-solving approach.", options: ["Proactive", "Sometimes proactive", "Reactive", "Avoidant"], max_score: 3 },
      { question_id: "ao5", question_text: "Empathy for others impacted.", options: ["Strong", "Some", "Limited", "None"], max_score: 3 },
      { question_id: "ao6", question_text: "Beliefs supporting offending/substance use.", options: ["Rejects such beliefs", "Some ambivalence", "Often rationalises", "Strongly endorses"], max_score: 3 },
      { question_id: "ao7", question_text: "Realistic goals and future orientation.", options: ["Clear and realistic", "Somewhat clear", "Unclear", "No plan/negative outlook"], max_score: 3 },
      { question_id: "ao8", question_text: "Willingness to engage with services.", options: ["Consistent", "Mostly", "Occasional", "Refuses/avoids"], max_score: 3 },
    ]
  },
];


export default function SurveyForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const participantId = urlParams.get('participant_id');
  const programId = urlParams.get('program_id');
  const preselectedSection = urlParams.get('section');
  const surveyType = urlParams.get('type') || 'intake'; // 'intake' or 'exit'
  const queryClient = useQueryClient();

  const [selectedSectionId, setSelectedSectionId] = useState(preselectedSection || null);
  const [responses, setResponses] = useState({});
  const [completed, setCompleted] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: participant } = useQuery({
    queryKey: ['participant', participantId],
    queryFn: () => base44.entities.Participant.filter({ id: participantId }),
    select: (data) => data[0],
    enabled: !!participantId,
  });

  // Get existing survey responses for this participant
  const { data: existingSurveys = [] } = useQuery({
    queryKey: ['surveyResponses', participantId],
    queryFn: () => base44.entities.SurveyResponse.filter({ participant_id: participantId }),
    enabled: !!participantId,
  });

  // Calculate which sections are already completed for current survey type
  const getCompletedSections = () => {
    const completed = {};
    const templateId = surveyType === 'exit' ? 'exit_assessment' : 'intake_assessment';
    existingSurveys.filter(s => s.survey_template_id === templateId).forEach(survey => {
      if (survey.section_id) {
        completed[survey.section_id] = survey;
      }
    });
    return completed;
  };

  const completedSections = getCompletedSections();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const section = SURVEY_SECTIONS.find(s => s.section_id === selectedSectionId);
      
      // Calculate section score
      let sectionScore = 0;
      let maxScore = 0;
      section.questions.forEach(q => {
        const answer = responses[q.question_id];
        if (answer !== undefined) {
          sectionScore += answer;
        }
        maxScore += q.max_score;
      });

      // Normalize to section's max_points (out of 100)
      const normalizedScore = Math.round((sectionScore / maxScore) * section.max_points);
      
      const percentage = (sectionScore / maxScore) * 100;
      let riskLevel = 'Low';
      if (percentage >= 75) riskLevel = 'Very High';
      else if (percentage >= 50) riskLevel = 'High';
      else if (percentage >= 25) riskLevel = 'Moderate';

      const templateId = surveyType === 'exit' ? 'exit_assessment' : 'intake_assessment';
      const templateName = surveyType === 'exit' ? 'Exit Assessment' : 'Intake Assessment';
      
      return base44.entities.SurveyResponse.create({
        survey_template_id: templateId,
        survey_template_name: `${templateName} - ${section.section_name}`,
        section_id: section.section_id,
        section_name: section.section_name,
        participant_id: participantId,
        program_id: programId || null,
        completed_by_user_id: user?.id,
        completed_by_name: user?.full_name,
        completed_date: new Date().toISOString().split('T')[0],
        raw_response_json: responses,
        domain_scores_json: [{
          domain_name: section.section_name,
          score: normalizedScore,
          max_score: section.max_points,
          risk_level: riskLevel
        }],
        overall_score: normalizedScore,
        overall_risk_band: riskLevel
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['surveyResponses']);
      setCompleted(true);
    }
  });

  const selectedSection = SURVEY_SECTIONS.find(s => s.section_id === selectedSectionId);

  const handleResponse = (questionId, optionIndex) => {
    setResponses(prev => ({
      ...prev,
      [questionId]: optionIndex
    }));
  };

  const canSubmit = () => {
    if (!selectedSection) return false;
    return selectedSection.questions.every(q => responses[q.question_id] !== undefined);
  };

  const handleSubmit = () => {
    saveMutation.mutate();
  };

  // Calculate total completion
  const totalMaxPoints = SURVEY_SECTIONS.reduce((sum, s) => sum + s.max_points, 0);
  const completedPoints = Object.keys(completedSections).reduce((sum, sectionId) => {
    const section = SURVEY_SECTIONS.find(s => s.section_id === sectionId);
    return sum + (section?.max_points || 0);
  }, 0);
  const overallProgress = Math.round((completedPoints / totalMaxPoints) * 100);

  if (completed) {
    return (
      <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Section Completed</h1>
          <p className="text-slate-400 mb-8">
            The {selectedSection?.section_name} section has been saved for {participant?.first_name} {participant?.last_name}.
          </p>
          <div className="flex gap-4 justify-center">
            <Button 
              onClick={() => {
                setCompleted(false);
                setSelectedSectionId(null);
                setResponses({});
              }}
              variant="outline"
              className="border-slate-700"
            >
              Complete Another Section
            </Button>
            <Link to={createPageUrl(`ParticipantDetail?id=${participantId}`)}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                View Participant Profile
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Section selection view
  if (!selectedSectionId) {
    return (
      <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-4xl mx-auto">
        <Link 
          to={createPageUrl(`ParticipantDetail?id=${participantId}`)}
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Participant
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Badge className={surveyType === 'exit' ? 'bg-violet-500/10 text-violet-400' : 'bg-blue-500/10 text-blue-400'}>
              {surveyType === 'exit' ? 'Exit Survey' : 'Intake Survey'}
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            {surveyType === 'exit' ? 'Exit' : 'Intake'} Assessment Survey
          </h1>
          {participant && (
            <p className="text-slate-400">
              Participant: {participant.first_name} {participant.last_name}
            </p>
          )}
        </div>

        {/* Overall Progress */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">Overall Completion</h3>
            <span className="text-2xl font-bold text-white">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3 bg-slate-800" />
          <p className="text-sm text-slate-400 mt-2">
            {Object.keys(completedSections).length} of {SURVEY_SECTIONS.length} sections completed ({completedPoints}/{totalMaxPoints} points)
          </p>
        </div>

        {/* Section Selection */}
        <h2 className="text-lg font-semibold text-white mb-4">Select a Section to Complete</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SURVEY_SECTIONS.map(section => {
            const isCompleted = !!completedSections[section.section_id];
            return (
              <button
                key={section.section_id}
                onClick={() => !isCompleted && setSelectedSectionId(section.section_id)}
                disabled={isCompleted}
                className={`text-left p-5 rounded-xl border transition-all ${
                  isCompleted 
                    ? 'bg-emerald-500/5 border-emerald-500/20 cursor-default'
                    : 'bg-slate-900/50 border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Circle className="h-5 w-5 text-slate-500" />
                    )}
                    <div>
                      <h3 className={`font-semibold ${isCompleted ? 'text-emerald-400' : 'text-white'}`}>
                        {section.section_name}
                      </h3>
                      <p className="text-sm text-slate-400 mt-1">{section.section_description}</p>
                    </div>
                  </div>
                  <Badge className={isCompleted ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700 text-slate-300'}>
                    {section.max_points} pts
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  {section.questions.length} questions
                </p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Section form view
  return (
    <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
      <button 
        onClick={() => {
          setSelectedSectionId(null);
          setResponses({});
        }}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Section Selection
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-blue-500/10 text-blue-400">{selectedSection.max_points} points</Badge>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          {selectedSection.section_name}
        </h1>
        <p className="text-slate-400 mt-1">{selectedSection.section_description}</p>
        {participant && (
          <p className="text-sm text-slate-500 mt-2">
            Participant: {participant.first_name} {participant.last_name}
          </p>
        )}
      </div>

      <Card className="bg-slate-900/50 border-slate-800 mb-6">
        <CardContent className="pt-6 space-y-6">
          {selectedSection.questions.map((question, qIdx) => (
            <div key={question.question_id} className="space-y-3">
              <Label className="text-white text-base">
                {qIdx + 1}. {question.question_text}
              </Label>
              <RadioGroup
                value={responses[question.question_id]?.toString()}
                onValueChange={(value) => handleResponse(question.question_id, parseInt(value))}
                className="space-y-2"
              >
                {question.options.map((option, optIdx) => (
                  <label
                    key={optIdx}
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <RadioGroupItem value={optIdx.toString()} />
                    <span className="text-slate-300">{option}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit() || saveMutation.isPending}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? 'Saving...' : 'Save Section'}
        </Button>
      </div>
    </div>
  );
}