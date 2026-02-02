import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
    Plus,
    Files,
    FileText,
    Image,
    File,
    Download,
    Trash2,
    Upload,
    Pencil
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import EmptyState from '@/components/ui/EmptyState.jsx';
import LoadingSpinner from '@/components/ui/LoadingSpinner.jsx';

import { auth, storage } from '@/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

import DocumentCompletionGrid from '@/components/documents/DocumentCompletionGrid.jsx';
import { DOCUMENT_TYPES } from '@/constants/documentTypes';

const categoryColors = {
    'Photo ID': 'bg-blue-500/10 text-blue-400',
    'Birth Cert': 'bg-blue-500/10 text-blue-400',
    'Residental Address': 'bg-blue-500/10 text-blue-400',
    'Concession': 'bg-blue-500/10 text-blue-400',
    'Resume': 'bg-pink-500/10 text-pink-400',
    'ISEP': 'bg-violet-500/10 text-violet-400',
    'Program': 'bg-violet-500/10 text-violet-400',
    'Media': 'bg-cyan-500/10 text-cyan-400',
    'Consent': 'bg-emerald-500/10 text-emerald-400',
    'Employment Contract': 'bg-amber-500/10 text-amber-400',
    'Medical': 'bg-red-500/10 text-red-400',
    'Training Certifcate': 'bg-violet-500/10 text-violet-400',
    'Reference': 'bg-cyan-500/10 text-cyan-400',
    'Other': 'bg-slate-500/10 text-slate-400',
};

const getFileIcon = (fileType) => {
    if (fileType?.startsWith('image/')) return Image;
    if (fileType?.includes('pdf')) return FileText;
    return File;
};

const guessDocType = (doc) => {
    const t = (doc?.file_type || '').toLowerCase();
    const name = (doc?.file_name || '').toLowerCase();

    if (t.startsWith('image/')) return 'Image';
    if (t.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
    if (name.endsWith('.doc') || name.endsWith('.docx')) return 'Word';
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) return 'Excel';
    if (name.endsWith('.ppt') || name.endsWith('.pptx')) return 'PowerPoint';
    if (t === 'external/url') return 'Link';
    return 'Other';
};

export default function ParticipantDocuments({ participantId }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState({
        category: 'Other',
        description: ''
    });
    const [selectedFile, setSelectedFile] = useState(null);
    const [externalUrl, setExternalUrl] = useState('');

    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState(null);
    const [editCategory, setEditCategory] = useState('');

    const [categoryFilter, setCategoryFilter] = useState('All');
    const [typeFilter, setTypeFilter] = useState('All');

    const queryClient = useQueryClient();

    const { data: documents = [], isLoading } = useQuery({
        queryKey: ['documents', participantId],
        queryFn: () => base44.entities.Document.filter({ linked_participant_id: participantId }),
    });

    const { data: user } = useQuery({
        queryKey: ['currentUser'],
        queryFn: () => base44.auth.me(),
    });

const { data: participant } = useQuery({
    queryKey: ['participant', participantId],
    queryFn: () => base44.entities.Participant.get(participantId),
    enabled: !!participantId,
});

    const canEditDocType = useMemo(() => {
        if (!user || !participant) return false;
        const roleOk = ['SystemAdmin', 'Manager', 'ContractsAdmin'].includes(user.role);
        const cwOk = participant.primary_case_worker_id && participant.primary_case_worker_id === user.id;
        return roleOk || cwOk;
    }, [user, participant]);

    const filteredDocuments = useMemo(() => {
        return (documents || []).filter(d => {
            const catOk = categoryFilter === 'All' ? true : (d.category === categoryFilter);
            const type = guessDocType(d);
            const typeOk = typeFilter === 'All' ? true : (type === typeFilter);
            return catOk && typeOk;
        });
    }, [documents, categoryFilter, typeFilter]);

    const createDocument = useMutation({
        mutationFn: async (data) => {
            const firebaseUser = auth.currentUser;

            if (!selectedFile && !externalUrl) throw new Error('No file selected and no URL provided');
            if (!firebaseUser?.uid) throw new Error('You must be signed in to upload documents.');

            setUploading(true);
            try {
                let fileUrl = '';
                let fileName = '';
                let fileType = '';
                let fileSize = null;
                let storage_path = null;

                if (externalUrl) {
                    fileUrl = externalUrl.trim();
                    fileName = data?.description?.trim() ? data.description.trim() : 'External Document';
                    fileType = 'external/url';
                    fileSize = null;
                    storage_path = null;
                } else {
                    fileName = selectedFile.name;
                    fileType = selectedFile.type || '';
                    fileSize = selectedFile.size || null;

                    const safeName = selectedFile.name.replace(/[^\w.\- ]+/g, '_');
                    const path = `uploads/${firebaseUser.uid}/${new Date().toISOString().replace(/[:.]/g, '-')}_${safeName}`;
                    storage_path = path;

                    const sRef = storageRef(storage, path);
                    await uploadBytes(sRef, selectedFile, { contentType: selectedFile.type || undefined });
                    fileUrl = await getDownloadURL(sRef);
                }

                await base44.entities.Document.create({
                    file_name: fileName,
                    file_type: fileType,
                    file_size: fileSize,
                    file_url: fileUrl,
                    storage_path: storage_path,

                    uploaded_by_user_id: user?.id || null,
                    uploaded_by_name: user?.full_name || null,

                    linked_participant_id: participantId,
                    category: data.category,
                    description: data.description,
                });

                return true;
            } catch (e) {
                console.error('Document upload failed:', e);
                alert(e?.message || 'Document upload failed. Check console for details.');
                throw e;
            } finally {
                setUploading(false);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['documents', participantId] });
            setDialogOpen(false);
            setFormData({ category: 'Other', description: '' });
            setSelectedFile(null);
            setExternalUrl('');
        },
    });


const updateDocumentCategory = useMutation({
    mutationFn: async ({ id, category }) => {
        if (!id) throw new Error('Missing document id');
        if (!category) throw new Error('Missing category');
        return base44.entities.Document.update(id, { category });
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['documents', participantId] });
        setEditDialogOpen(false);
        setEditingDoc(null);
    },
});

const deleteDocument = useMutation({

        mutationFn: async (docRecord) => {
            if (docRecord?.storage_path) {
                try {
                    const sRef = storageRef(storage, docRecord.storage_path);
                    await deleteObject(sRef);
                } catch (e) {
                    console.warn('Storage delete failed (continuing to delete DB record):', e);
                }
            }
            return base44.entities.Document.delete(docRecord.id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['documents', participantId] });
        }
    });

    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    if (isLoading) return <LoadingSpinner />;

    return (
        <div>
            {/* Added: completion grid in Documents section (participant only) */}
            <div className="mb-6">
                <DocumentCompletionGrid
                    title="Documents Completion"
                    documentTypes={DOCUMENT_TYPES}
                    documents={documents}
                    onTypeClick={(type) => {
                        setCategoryFilter(type);
                    }}
                />
            </div>

            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">Documents</h3>

                    {/* Filters */}
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="h-9 w-[190px] bg-slate-900 border-slate-800 text-white">
                            <SelectValue placeholder="Filter document type" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            {['All', ...DOCUMENT_TYPES].map(cat => (
                                <SelectItem key={cat} value={cat} className="text-white">{cat}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="h-9 w-[140px] bg-slate-900 border-slate-800 text-white">
                            <SelectValue placeholder="Filter file kind" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                            {['All', 'Image', 'PDF', 'Word', 'Excel', 'PowerPoint', 'Link', 'Other'].map(t => (
                                <SelectItem key={t} value={t} className="text-white">{t}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" />
                            Upload Document
                        </Button>
                    </DialogTrigger>

                    <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-white">Upload Document</DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4 mt-4">
                            <div>
                                <Label className="text-slate-300">File (upload)</Label>
                                <div className="mt-2">
                                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-slate-600 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                            <Upload className="h-8 w-8 text-slate-500 mb-2" />
                                            {selectedFile ? (
                                                <p className="text-sm text-slate-300">{selectedFile.name}</p>
                                            ) : (
                                                <p className="text-sm text-slate-500">Click to upload</p>
                                            )}
                                            {externalUrl ? (
                                                <p className="text-xs text-amber-400 mt-2">External URL is set - clear it to upload a file.</p>
                                            ) : null}
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            disabled={!!externalUrl}
                                            onChange={(e) => setSelectedFile(e.target.files[0])}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div>
                                <Label className="text-slate-300">Or link URL (no upload)</Label>
                                <Input
                                    value={externalUrl}
                                    onChange={(e) => {
                                        setExternalUrl(e.target.value);
                                        if (e.target.value) setSelectedFile(null);
                                    }}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    placeholder="https://..."
                                />
                                {selectedFile ? (
                                    <p className="text-xs text-amber-400 mt-2">File is selected - clear it to use an external URL.</p>
                                ) : null}
                            </div>

                            <div>
                                <Label className="text-slate-300">Document Type</Label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(v) => setFormData({ ...formData, category: v })}
                                >
                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-800 border-slate-700">
                                        {DOCUMENT_TYPES.map(cat => (
                                            <SelectItem key={cat} value={cat} className="text-white">{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="text-slate-300">Description</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="bg-slate-800 border-slate-700 text-white"
                                    rows={2}
                                    placeholder="Optional description"
                                />
                            </div>

                            <Button
                                onClick={() => createDocument.mutate(formData)}
                                disabled={(!selectedFile && !externalUrl) || uploading || !auth.currentUser?.uid}
                                className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                                {uploading ? 'Uploading...' : 'Upload'}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {filteredDocuments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredDocuments.map(doc => {
                        const FileIcon = getFileIcon(doc.file_type);
                        const isImage = doc.file_type?.startsWith('image/');
                        return (
                            <div
                                key={doc.id}
                                className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-4"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center">
                                        {isImage && doc.file_url ? (
                                            <img
                                                src={doc.file_url}
                                                alt={doc.file_name}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <FileIcon className="h-5 w-5 text-slate-400" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white truncate">{doc.file_name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge className={categoryColors[doc.category] || categoryColors.Other}>
                                                {doc.category || 'Other'}
                                            </Badge>
                                            <Badge className="bg-slate-700/40 text-slate-300">
                                                {guessDocType(doc)}
                                            </Badge>
                                            <span className="text-xs text-slate-500">
                                                {formatFileSize(doc.file_size)}
                                            </span>
                                        </div>
                                        {doc.description && (
                                            <p className="text-sm text-slate-400 mt-2 line-clamp-1">{doc.description}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                            <span>{doc.uploaded_by_name}</span>
                                            {doc.created_date && (
                                                <span>{format(new Date(doc.created_date), 'MMM d, yyyy')}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-white">
                                                <Download className="h-4 w-4" />
                                            </Button>
                                        </a>
                                        
{canEditDocType && (
    <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-slate-400 hover:text-white"
        onClick={() => {
            setEditingDoc(doc);
            setEditCategory(doc.category || 'Other');
            setEditDialogOpen(true);
        }}
    >
        <Pencil className="h-4 w-4" />
    </Button>
)}
<Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-400 hover:text-red-400"
                                            onClick={() => {
                                                if (window.confirm('Are you sure you want to delete this document?')) {
                                                    deleteDocument.mutate(doc);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    icon={Files}
                    title="No documents"
                    description="Upload documents for this participant"
                    actionLabel="Upload Document"
                    onAction={() => setDialogOpen(true)}
                />
            )}
        </div>
    );
}
