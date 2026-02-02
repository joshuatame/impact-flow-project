// src/components/dashboard/SurveyCompletionGrid.jsx
import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, ClipboardList } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { SURVEY_SECTIONS } from "@/pages/SurveyForm.jsx";

export default function SurveyCompletionGrid({ filterMode = 'all', selectedProgramId = '', currentUserId = null }) {
  const pageSize = 7;
  const [page, setPage] = useState(0);

  // Participants
  const {
    data: participants = [],
    isLoading: loadingParticipants,
  } = useQuery({
    queryKey: ["participants"],
    queryFn: () => base44.entities.Participant.list("-created_date", 500),
  });

  // All survey responses
  const {
    data: surveyResponses = [],
    isLoading: loadingSurveys,
  } = useQuery({
    queryKey: ["allSurveyResponses"],
    queryFn: () => base44.entities.SurveyResponse.list("-created_date", 2000),
  });

  if (loadingParticipants || loadingSurveys) {
    return <LoadingSpinner size="sm" />;
  }

  const activeParticipants = participants.filter((p) => p.status === "Active");

  const dashboardFilteredParticipants = activeParticipants.filter((p) => {
    if (filterMode === 'my' && currentUserId) return p.primary_case_worker_id === currentUserId;
    if (filterMode === 'program' && selectedProgramId) {
      if (p.program_id === selectedProgramId) return true;
      if (Array.isArray(p.program_ids) && p.program_ids.includes(selectedProgramId)) return true;
      return false;
    }
    return true;
  });

  // Build completion map: participantId -> Set of completed section_ids
  const completionMap = {};
  surveyResponses.forEach((sr) => {
    if (sr.section_id && sr.participant_id) {
      if (!completionMap[sr.participant_id]) {
        completionMap[sr.participant_id] = new Set();
      }
      completionMap[sr.participant_id].add(sr.section_id);
    }
  });

  // Calculate stats per participant
  const participantStats = activeParticipants
    .map((p) => {
      const completed = completionMap[p.id] || new Set();
      const missing = SURVEY_SECTIONS.filter(
        (s) => !completed.has(s.section_id)
      );
      const completedCount = SURVEY_SECTIONS.length - missing.length;
      const percentage = Math.round(
        (completedCount / SURVEY_SECTIONS.length) * 100
      );

      return {
        ...p,
        completedSections: completed,
        missingSections: missing,
        completedCount,
        percentage,
      };
    })
    // Sort by least complete first
    .sort((a, b) => a.percentage - b.percentage);

  // Short labels for table header
  const shortSectionNames = {
    criminal_history: "CH",
    education_employment: "EE",
    financial: "FIN",
    family_marital: "FM",
    accommodation: "ACC",
    leisure_recreation: "LR",
    companions: "COM",
    alcohol_drug: "AD",
    emotional_personal: "EP",
    attitude_orientation: "AO",
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">
            Survey Completion Status
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {SURVEY_SECTIONS.map((s) => (
            <span
              key={s.section_id}
              title={s.section_name}
              className="px-1.5 py-0.5 bg-slate-800 rounded"
            >
              {shortSectionNames[s.section_id]}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-emerald-500" />
          <span>Complete</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/50" />
          <span>Missing</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-3 px-2 text-sm font-medium text-slate-400">
                Participant
              </th>
              <th className="text-center py-3 px-2 text-sm font-medium text-slate-400 w-24">
                Progress
              </th>
              {SURVEY_SECTIONS.map((section) => (
                <th
                  key={section.section_id}
                  className="text-center py-3 px-1 text-xs font-medium text-slate-500 w-10"
                  title={section.section_name}
                >
                  {shortSectionNames[section.section_id]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {participantStats.slice(page * pageSize, page * pageSize + pageSize).map((participant) => (
              <tr
                key={participant.id}
                className="border-b border-slate-800/50 hover:bg-slate-800/20"
              >
                <td className="py-3 px-2">
                  <Link
                    to={createPageUrl("/ParticipantDetail", {
                      id: participant.id,
                    })}
                    className="flex items-center gap-3 hover:opacity-80"
                  >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold">
                      {participant.first_name?.[0]}
                      {participant.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {participant.first_name} {participant.last_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {participant.current_phase}
                      </p>
                    </div>
                  </Link>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={participant.percentage}
                      className="h-2 w-16 bg-slate-800"
                    />
                    <span
                      className={`text-xs font-medium ${
                        participant.percentage === 100
                          ? "text-emerald-400"
                          : participant.percentage >= 50
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {participant.percentage}%
                    </span>
                  </div>
                </td>
                {SURVEY_SECTIONS.map((section) => {
                  const isCompleted = participant.completedSections.has(
                    section.section_id
                  );

                  return (
                    <td
                      key={section.section_id}
                      className="py-3 px-1 text-center"
                    >
                      {isCompleted ? (
                        <div className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center mx-auto">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                      ) : (
                        <Link
                          to={createPageUrl("/SurveyForm", {
                            participant_id: participant.id,
                            section: section.section_id,
                          })}
                        >
                          <div className="w-6 h-6 rounded bg-red-500/10 flex items-center justify-center mx-auto hover:bg-red-500/20 transition-colors cursor-pointer">
                            <XCircle className="h-3.5 w-3.5 text-red-400/60" />
                          </div>
                        </Link>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between mt-3">
          <div className="text-xs text-slate-400">
            Showing {Math.min(participantStats.length, page * pageSize + 1)}-{Math.min(participantStats.length, page * pageSize + pageSize)} of {participantStats.length}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Prev
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 text-xs disabled:opacity-50"
              onClick={() => setPage((p) => (p + 1) * pageSize >= participantStats.length ? p : p + 1)}
              disabled={(page + 1) * pageSize >= participantStats.length}
            >
              Next
            </button>
          </div>
        </div>

      </div>

      {participantStats.length === 0 && (
        <div className="text-center py-8 text-slate-500">
          No active participants found
        </div>
      )}

      {participantStats.length > 20 && (
        <p className="text-sm text-slate-500 mt-4 text-center">
          Showing 20 of {participantStats.length} participants (sorted by least
          complete)
        </p>
      )}
    </div>
  );
}
