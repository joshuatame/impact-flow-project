import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  TrendingDown, 
  TrendingUp, 
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend
} from 'recharts';
import { SURVEY_SECTIONS } from '@/pages/SurveyForm.jsx';
import { cn } from '@/lib/utils';

const tierConfig = {
  1: { name: 'Tier 1 - Low Risk', colour: 'bg-emerald-500', textColour: 'text-emerald-400' },
  2: { name: 'Tier 2 - Low-Moderate', colour: 'bg-green-500', textColour: 'text-green-400' },
  3: { name: 'Tier 3 - Moderate', colour: 'bg-amber-500', textColour: 'text-amber-400' },
  4: { name: 'Tier 4 - Moderate-High', colour: 'bg-orange-500', textColour: 'text-orange-400' },
  5: { name: 'Tier 5 - High Risk', colour: 'bg-red-500', textColour: 'text-red-400' }
};

const getTier = (totalScore) => {
  if (totalScore <= 24) return 1;
  if (totalScore <= 39) return 2;
  if (totalScore <= 54) return 3;
  if (totalScore <= 69) return 4;
  return 5;
};

export default function AssessmentComparison({ intakeScores, exitScores }) {
  const [view, setView] = useState('intake'); // 'intake', 'exit', 'comparison'

  const intakeTier = intakeScores ? getTier(intakeScores.totalScore) : null;
  const exitTier = exitScores ? getTier(exitScores.totalScore) : null;

  const scoreChange = exitScores && intakeScores 
    ? intakeScores.totalScore - exitScores.totalScore 
    : 0;
  const percentageImprovement = intakeScores?.totalScore > 0 
    ? Math.round((scoreChange / intakeScores.totalScore) * 100) 
    : 0;

  // Prepare comparison data for charts
  const comparisonData = SURVEY_SECTIONS.map(section => {
    const intakeData = intakeScores?.sectionScores[section.section_id];
    const exitData = exitScores?.sectionScores[section.section_id];
    return {
      name: section.section_name.split('/')[0].trim().slice(0, 12),
      fullName: section.section_name,
      intake: intakeData ? Math.round((intakeData.score / intakeData.maxScore) * 100) : 0,
      exit: exitData ? Math.round((exitData.score / exitData.maxScore) * 100) : 0,
      intakeScore: intakeData?.score || 0,
      exitScore: exitData?.score || 0,
      maxScore: section.max_points,
      change: (intakeData?.score || 0) - (exitData?.score || 0)
    };
  });

  const radarData = comparisonData.map(d => ({
    domain: d.name,
    Intake: d.intake,
    Exit: d.exit
  }));

  const hasExitData = exitScores && exitScores.completedSections > 0;

  const renderScoreCard = (scores, label, tierNum, isIntake = true) => {
    if (!scores) return null;
    const tier = tierConfig[tierNum];
    return (
      <Card className={cn(
        "border-2 transition-all duration-300",
        tierNum <= 2 ? 'border-emerald-500/30 bg-emerald-500/5' : 
        tierNum === 3 ? 'border-amber-500/30 bg-amber-500/5' : 
        'border-red-500/30 bg-red-500/5'
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Badge className={cn(
              "text-sm",
              isIntake ? "bg-blue-500/20 text-blue-400" : "bg-violet-500/20 text-violet-400"
            )}>
              {label}
            </Badge>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${tier.colour}`} />
              <span className={`text-sm font-medium ${tier.textColour}`}>
                {tier.name}
              </span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-5xl font-bold text-white">{scores.totalScore}</p>
            <p className="text-sm text-slate-400 mt-1">out of 100 points</p>
            <p className="text-xs text-slate-500 mt-2">
              {scores.completedSections}/{scores.totalSections} sections completed
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex items-center justify-center gap-2 bg-slate-800/50 p-1 rounded-lg w-fit mx-auto">
        <Button
          variant={view === 'intake' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setView('intake')}
          className={view === 'intake' ? 'bg-blue-600' : ''}
        >
          Initial Assessment
        </Button>
        {hasExitData && (
          <>
            <Button
              variant={view === 'exit' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('exit')}
              className={view === 'exit' ? 'bg-violet-600' : ''}
            >
              Exit Assessment
            </Button>
            <Button
              variant={view === 'comparison' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setView('comparison')}
              className={view === 'comparison' ? 'bg-emerald-600' : ''}
            >
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              Compare
            </Button>
          </>
        )}
      </div>

      {/* Single Assessment View */}
      {(view === 'intake' || view === 'exit') && (
        <div className="space-y-6">
          {view === 'intake' && renderScoreCard(intakeScores, 'Initial Assessment', intakeTier, true)}
          {view === 'exit' && renderScoreCard(exitScores, 'Exit Assessment', exitTier, false)}

          {/* Single Radar Chart */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">
                {view === 'intake' ? 'Initial' : 'Exit'} Risk Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={comparisonData.map(d => ({
                    domain: d.name,
                    score: view === 'intake' ? d.intake : d.exit
                  }))}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="domain" stroke="#64748b" fontSize={9} />
                    <PolarRadiusAxis stroke="#64748b" domain={[0, 100]} />
                    <Radar
                      name="Risk %"
                      dataKey="score"
                      stroke={view === 'intake' ? '#3b82f6' : '#8b5cf6'}
                      fill={view === 'intake' ? '#3b82f6' : '#8b5cf6'}
                      fillOpacity={0.3}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Navigation hint */}
          {hasExitData && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => setView(view === 'intake' ? 'exit' : 'comparison')}
                className="text-slate-400"
              >
                {view === 'intake' ? (
                  <>View Exit Assessment <ChevronRight className="h-4 w-4 ml-1" /></>
                ) : (
                  <>View Comparison <ChevronRight className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Comparison View */}
      {view === 'comparison' && hasExitData && (
        <div className="space-y-6">
          {/* Side by Side Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderScoreCard(intakeScores, 'Initial', intakeTier, true)}
            
            {/* Change Summary */}
            <Card className={cn(
              "border-2 flex items-center justify-center",
              scoreChange > 0 
                ? "border-emerald-500/30 bg-emerald-500/5" 
                : scoreChange < 0 
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-slate-500/30 bg-slate-500/5"
            )}>
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  {scoreChange > 0 ? (
                    <TrendingDown className="h-8 w-8 text-emerald-400" />
                  ) : scoreChange < 0 ? (
                    <TrendingUp className="h-8 w-8 text-red-400" />
                  ) : (
                    <ArrowRight className="h-8 w-8 text-slate-400" />
                  )}
                </div>
                <p className={cn(
                  "text-4xl font-bold",
                  scoreChange > 0 ? "text-emerald-400" : scoreChange < 0 ? "text-red-400" : "text-slate-400"
                )}>
                  {scoreChange > 0 ? `-${scoreChange}` : scoreChange < 0 ? `+${Math.abs(scoreChange)}` : '0'}
                </p>
                <p className="text-sm text-slate-400 mt-1">points</p>
                {scoreChange !== 0 && (
                  <Badge className={cn(
                    "mt-2",
                    scoreChange > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  )}>
                    {percentageImprovement > 0 ? `${percentageImprovement}% improvement` : `${Math.abs(percentageImprovement)}% increase`}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {renderScoreCard(exitScores, 'Exit', exitTier, false)}
          </div>

          {/* Overlay Radar Chart */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Risk Profile Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="domain" stroke="#64748b" fontSize={10} />
                    <PolarRadiusAxis stroke="#64748b" domain={[0, 100]} />
                    <Radar
                      name="Initial"
                      dataKey="Intake"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Radar
                      name="Exit"
                      dataKey="Exit"
                      stroke="#8b5cf6"
                      fill="#8b5cf6"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Legend 
                      wrapperStyle={{ color: '#fff' }}
                      formatter={(value) => <span className="text-slate-300">{value}</span>}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Section by Section Comparison */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Section Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={12} domain={[0, 100]} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="#64748b" 
                      fontSize={9}
                      width={80}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                      formatter={(value, name) => [`${value}%`, name === 'intake' ? 'Initial' : 'Exit']}
                    />
                    <Legend 
                      formatter={(value) => <span className="text-slate-300">{value === 'intake' ? 'Initial' : 'Exit'}</span>}
                    />
                    <Bar dataKey="intake" name="intake" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="exit" name="exit" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Changes Table */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Detailed Changes by Section</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {comparisonData.map((section, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30"
                  >
                    <span className="text-white text-sm">{section.fullName}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-blue-400 text-sm">{section.intakeScore} pts</span>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                      <span className="text-violet-400 text-sm">{section.exitScore} pts</span>
                      <Badge className={cn(
                        "min-w-16 justify-center",
                        section.change > 0 
                          ? "bg-emerald-500/20 text-emerald-400" 
                          : section.change < 0 
                            ? "bg-red-500/20 text-red-400"
                            : "bg-slate-500/20 text-slate-400"
                      )}>
                        {section.change > 0 ? `-${section.change}` : section.change < 0 ? `+${Math.abs(section.change)}` : '0'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* No Exit Data Message */}
      {!hasExitData && view !== 'intake' && (
        <Card className="bg-slate-800/30 border-slate-700">
          <CardContent className="p-8 text-center">
            <p className="text-slate-400">Exit assessment not yet completed</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}