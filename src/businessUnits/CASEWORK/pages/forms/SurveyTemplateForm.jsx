import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import LoadingSpinner from "@/components/ui/LoadingSpinner.jsx";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

function getTemplateShape(t) {
    // Supports a few possible shapes coming out of SurveyBuilder.
    // You can standardise later if needed.
    const sections =
        t?.sections ||
        t?.sections_json ||
        t?.template_json?.sections ||
        t?.template_json?.sections_json ||
        [];

    // Flatten into questions with optional section grouping
    const flat = [];
    sections.forEach((s, sIdx) => {
        const sectionName = s.section_name || s.name || `Section ${sIdx + 1}`;
        const questions = s.questions || s.questions_json || [];
        questions.forEach((q, qIdx) => {
            flat.push({
                sectionName,
                question_id: q.question_id || q.id || `${sIdx}_${qIdx}`,
                question_text: q.question_text || q.text || q.label || `Question ${qIdx + 1}`,
                type: q.type || (Array.isArray(q.options) ? "radio" : "text"),
                options: q.options || [],
            });
        });
    });

    // If no sections array exists, try a top-level questions array
    if (flat.length === 0) {
        const questions = t?.questions || t?.questions_json || t?.template_json?.questions || [];
        questions.forEach((q, idx) => {
            flat.push({
                sectionName: null,
                question_id: q.question_id || q.id || String(idx),
                question_text: q.question_text || q.text || q.label || `Question ${idx + 1}`,
                type: q.type || (Array.isArray(q.options) ? "radio" : "text"),
                options: q.options || [],
            });
        });
    }

    return flat;
}

export default function SurveyTemplateForm() {
    const urlParams = new URLSearchParams(window.location.search);
    const participantId = urlParams.get("participant_id");
    const templateId = urlParams.get("template_id");
    const queryClient = useQueryClient();

    const [responses, setResponses] = useState({});
    const [completed, setCompleted] = useState(false);

    const { data: user } = useQuery({
        queryKey: ["currentUser"],
        queryFn: () => base44.auth.me(),
    });

    const { data: participant } = useQuery({
        queryKey: ["participant", participantId],
        queryFn: () => base44.entities.Participant.filter({ id: participantId }),
        select: (d) => d?.[0],
        enabled: !!participantId,
    });

    const { data: template, isLoading } = useQuery({
        queryKey: ["surveyTemplate", templateId],
        queryFn: () => base44.entities.SurveyTemplate.get(templateId),
        enabled: !!templateId,
    });

    const questions = useMemo(() => getTemplateShape(template), [template]);

    const templateName = template?.template_name || template?.survey_template_name || "Survey";
    const templateDesc = template?.description || template?.template_description || "";

    const canSubmit = useMemo(() => {
        if (!questions.length) return false;
        return questions.every((q) => responses[q.question_id] !== undefined && responses[q.question_id] !== "");
    }, [questions, responses]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            // IMPORTANT: Do not set section_id or the LSI-R fields.
            return base44.entities.SurveyResponse.create({
                survey_template_id: templateId,
                survey_template_name: templateName,
                participant_id: participantId,
                completed_by_user_id: user?.id || null,
                completed_by_name: user?.full_name || null,
                completed_date: new Date().toISOString().split("T")[0],
                raw_response_json: responses,
                response_type: "custom_template",
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["surveyResponses", participantId] });
            setCompleted(true);
        },
    });

    const handleResponse = (questionId, value) => {
        setResponses((prev) => ({ ...prev, [questionId]: value }));
    };

    if (isLoading) return <LoadingSpinner />;

    if (completed) {
        return (
            <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
                <div className="text-center py-16">
                    <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                        <CheckCircle className="h-10 w-10 text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-4">Survey Completed</h1>
                    <p className="text-slate-400 mb-8">
                        {templateName} has been saved for {participant?.first_name} {participant?.last_name}.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <Button
                            onClick={() => {
                                setCompleted(false);
                                setResponses({});
                            }}
                            variant="outline"
                            className="border-slate-700"
                        >
                            Complete Again
                        </Button>
                        <Link to={createPageUrl(`ParticipantDetail?id=${participantId}`)}>
                            <Button className="bg-blue-600 hover:bg-blue-700">Back to Participant</Button>
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8 max-w-2xl mx-auto">
            <Link
                to={createPageUrl(`ParticipantDetail?id=${participantId}`)}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Participant
            </Link>

            <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-violet-500/10 text-violet-300 border-violet-500/20">Other Survey</Badge>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{templateName}</h1>
                {templateDesc ? <p className="text-slate-400 mt-2">{templateDesc}</p> : null}
                {participant ? (
                    <p className="text-sm text-slate-500 mt-3">
                        Participant: {participant.first_name} {participant.last_name}
                    </p>
                ) : null}
            </div>

            {questions.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-slate-400">
                    This template has no questions (or the SurveyBuilder schema does not match what this runner expects).
                    If you paste one SurveyTemplate document shape here, I will align it perfectly.
                </div>
            ) : (
                <Card className="bg-slate-900/50 border-slate-800 mb-6">
                    <CardContent className="pt-6 space-y-6">
                        {questions.map((q, idx) => (
                            <div key={q.question_id} className="space-y-3">
                                {q.sectionName ? (
                                    <div className="text-xs text-slate-500">{q.sectionName}</div>
                                ) : null}

                                <Label className="text-white text-base">
                                    {idx + 1}. {q.question_text}
                                </Label>

                                {q.type === "radio" && Array.isArray(q.options) && q.options.length > 0 ? (
                                    <RadioGroup
                                        value={responses[q.question_id]?.toString()}
                                        onValueChange={(value) => handleResponse(q.question_id, value)}
                                        className="space-y-2"
                                    >
                                        {q.options.map((opt, optIdx) => (
                                            <label
                                                key={optIdx}
                                                className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer transition-colors"
                                            >
                                                <RadioGroupItem value={String(opt)} />
                                                <span className="text-slate-300">{String(opt)}</span>
                                            </label>
                                        ))}
                                    </RadioGroup>
                                ) : (
                                    <Input
                                        value={responses[q.question_id] || ""}
                                        onChange={(e) => handleResponse(q.question_id, e.target.value)}
                                        className="bg-slate-900/50 border-slate-800 text-white"
                                        placeholder="Type your answer"
                                    />
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            <div className="flex items-center justify-end">
                <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={!canSubmit || saveMutation.isPending || questions.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saveMutation.isPending ? "Saving..." : "Save Survey"}
                </Button>
            </div>
        </div>
    );
}
