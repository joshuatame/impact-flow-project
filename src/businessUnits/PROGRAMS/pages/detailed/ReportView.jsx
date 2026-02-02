import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// ✅ Chart text color requirements
const CHART_TEXT = '#ffffff';
const TOOLTIP_STYLE = {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: CHART_TEXT,
};
const TOOLTIP_LABEL_STYLE = { color: CHART_TEXT };
const TOOLTIP_ITEM_STYLE = { color: CHART_TEXT };

// ✅ White labels for Pie charts
function PieLabelWhite(props) {
    const { x, y, name, value, textAnchor } = props;
    return (
        <text
            x={x}
            y={y}
            fill={CHART_TEXT}
            textAnchor={textAnchor}
            dominantBaseline="central"
            fontSize={12}
        >
            {`${name}: ${value}`}
        </text>
    );
}

export default function ReportView() {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');
    const [chartsData, setChartsData] = useState({});

    const { data: report, isLoading } = useQuery({
        queryKey: ['customReport', reportId],
        queryFn: () => base44.entities.CustomReport.filter({ id: reportId }),
        select: (data) => data[0],
        enabled: !!reportId,
    });

    useEffect(() => {
        if (report?.charts?.length > 0) {
            fetchAllChartData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [report]);

    const fetchDataForSource = async (source) => {
        switch (source) {
            case 'Participant':
                return base44.entities.Participant.list('-created_date', 1000);
            case 'CaseNote':
                return base44.entities.CaseNote.list('-created_date', 1000);
            case 'EmploymentPlacement':
                return base44.entities.EmploymentPlacement.list('-created_date', 500);
            case 'ParticipantTraining':
                return base44.entities.ParticipantTraining.list('-created_date', 500);
            case 'FundingRecord':
                return base44.entities.FundingRecord.list('-created_date', 500);
            case 'SurveyResponse':
                return base44.entities.SurveyResponse.list('-created_date', 500);
            case 'Program':
                return base44.entities.Program.list('-created_date', 100);
            default:
                return [];
        }
    };

    const fetchAllChartData = async () => {
        const newData = {};
        for (const chart of report.charts || []) {
            const rawData = await fetchDataForSource(chart.data_source);
            const grouped = rawData.reduce((acc, item) => {
                const key = item[chart.group_by] || 'Unknown';
                if (!acc[key]) acc[key] = { items: [], sum: 0 };
                acc[key].items.push(item);
                if (chart.aggregate_field && item[chart.aggregate_field]) {
                    acc[key].sum += Number(item[chart.aggregate_field]) || 0;
                }
                return acc;
            }, {});

            newData[chart.chart_id] = Object.entries(grouped).map(([name, { items, sum }]) => ({
                name,
                value:
                    chart.aggregate === 'count' ? items.length :
                        chart.aggregate === 'sum' ? sum :
                            chart.aggregate === 'average' ? (items.length ? (sum / items.length) : 0) :
                                items.length
            }));
        }
        setChartsData(newData);
    };

    const renderChart = (chart, data) => {
        if (!data || data.length === 0) {
            return <div className="h-64 flex items-center justify-center text-slate-500">Loading...</div>;
        }

        const height = 300;

        switch (chart.chart_type) {
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'line':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                );
            case 'area':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <AreaChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="name" stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <YAxis stroke={CHART_TEXT} tick={{ fill: CHART_TEXT }} fontSize={12} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        </AreaChart>
                    </ResponsiveContainer>
                );
            case 'pie':
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <RechartsPie>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                dataKey="value"
                                labelLine={false}
                                label={<PieLabelWhite />}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                        </RechartsPie>
                    </ResponsiveContainer>
                );
            case 'table':
                return (
                    <div className="overflow-auto max-h-64">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-800">
                                <tr>
                                    <th className="text-left p-3 text-slate-300">Category</th>
                                    <th className="text-right p-3 text-slate-300">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, idx) => (
                                    <tr key={idx} className="border-b border-slate-800">
                                        <td className="p-3 text-white">{row.name}</td>
                                        <td className="p-3 text-right text-white">{row.value?.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            default:
                return null;
        }
    };

    if (isLoading) return <LoadingSpinner />;

    if (!report) {
        return (
            <div className="p-8 text-center">
                <h2 className="text-xl font-semibold text-white mb-2">Report not found</h2>
                <Link to={createPageUrl('Reports')}>
                    <Button variant="outline">Back to Reports</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 pb-24 lg:pb-8">
            <Link
                to={createPageUrl('Reports')}
                className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Reports
            </Link>

            <PageHeader
                title={report.name}
                subtitle={report.description}
            >
                <Link to={createPageUrl(`ReportBuilder?id=${reportId}`)}>
                    <Button variant="outline" className="border-slate-700">
                        <Edit className="h-4 w-4 mr-2" />
                        Edit Report
                    </Button>
                </Link>
            </PageHeader>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(report.charts || []).map((chart, idx) => (
                    <Card key={chart.chart_id || idx} className="bg-slate-900/50 border-slate-800">
                        <CardHeader>
                            <CardTitle className="text-white">{chart.title || `Chart ${idx + 1}`}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {renderChart(chart, chartsData[chart.chart_id])}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {(!report.charts || report.charts.length === 0) && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-8 text-center">
                        <p className="text-slate-400">This report has no charts configured.</p>
                        <Link to={createPageUrl(`ReportBuilder?id=${reportId}`)}>
                            <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
                                <Edit className="h-4 w-4 mr-2" />
                                Configure Report
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
