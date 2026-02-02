import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

import DocumentCompletionGrid from "@/components/documents/DocumentCompletionGrid.jsx";
import { DOCUMENT_TYPES } from "@/constants/documentTypes";

export default function ParticipantDocumentsCompletion({ participantId, className = "" }) {
    const { data: documents = [], isLoading } = useQuery({
        queryKey: ["documents", participantId],
        queryFn: () => base44.entities.Document.filter({ linked_participant_id: participantId }),
    });

    if (isLoading) return null;

    return (
        <DocumentCompletionGrid
            className={className}
            title="Documents Completion"
            documentTypes={DOCUMENT_TYPES}
            documents={documents}
        />
    );
}
