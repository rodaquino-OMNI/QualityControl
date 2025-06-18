import React, { useState } from 'react';
import { CSVLink } from 'react-csv';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { ExportOptions } from '../../types/analytics';

interface ExportControlsProps {
  onExport: (options: ExportOptions) => void;
}

const ExportControls: React.FC<ExportControlsProps> = ({ onExport }) => {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'pdf',
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    },
    metrics: ['cases', 'performance', 'fraud', 'ai'],
    includeCharts: true
  });

  // Mock data for export
  const mockExportData = {
    summary: {
      totalCases: 1523,
      approvedCases: 1168,
      deniedCases: 355,
      avgProcessingTime: 4.2,
      fraudDetectionRate: 94.3,
      aiConfidenceScore: 92.3
    },
    auditors: [
      { name: 'Ana Silva', cases: 245, accuracy: 98.5, avgTime: 3.2 },
      { name: 'Carlos Santos', cases: 198, accuracy: 97.2, avgTime: 4.1 },
      { name: 'Maria Costa', cases: 312, accuracy: 99.1, avgTime: 2.8 },
      { name: 'João Oliveira', cases: 276, accuracy: 98.8, avgTime: 3.5 },
      { name: 'Patricia Lima', cases: 189, accuracy: 97.8, avgTime: 3.9 }
    ],
    dailyMetrics: Array.from({ length: 30 }, (_, i) => ({
      date: format(new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000), 'dd/MM/yyyy'),
      cases: Math.floor(Math.random() * 100) + 50,
      approvalRate: Math.random() * 20 + 70,
      avgTime: Math.random() * 2 + 3
    }))
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.text('AUSTA Cockpit - Relatório Analítico', 14, 22);
    
    // Date range
    doc.setFontSize(10);
    doc.text(
      `Período: ${format(exportOptions.dateRange.start, 'dd/MM/yyyy')} - ${format(exportOptions.dateRange.end, 'dd/MM/yyyy')}`,
      14, 30
    );
    
    // Summary section
    doc.setFontSize(14);
    doc.text('Resumo Executivo', 14, 45);
    
    doc.setFontSize(10);
    const summaryData = [
      ['Métrica', 'Valor'],
      ['Total de Casos', mockExportData.summary.totalCases.toString()],
      ['Casos Aprovados', mockExportData.summary.approvedCases.toString()],
      ['Casos Negados', mockExportData.summary.deniedCases.toString()],
      ['Tempo Médio de Processamento', `${mockExportData.summary.avgProcessingTime} min`],
      ['Taxa de Detecção de Fraudes', `${mockExportData.summary.fraudDetectionRate}%`],
      ['Score de Confiança IA', `${mockExportData.summary.aiConfidenceScore}%`]
    ];
    
    autoTable(doc, {
      startY: 50,
      head: [summaryData[0]],
      body: summaryData.slice(1),
      theme: 'striped'
    });
    
    // Auditor performance section
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(14);
    doc.text('Performance dos Auditores', 14, finalY + 15);
    
    const auditorData = [
      ['Auditor', 'Casos', 'Precisão', 'Tempo Médio'],
      ...mockExportData.auditors.map(a => [
        a.name,
        a.cases.toString(),
        `${a.accuracy}%`,
        `${a.avgTime} min`
      ])
    ];
    
    autoTable(doc, {
      startY: finalY + 20,
      head: [auditorData[0]],
      body: auditorData.slice(1),
      theme: 'striped'
    });
    
    // Save the PDF
    doc.save(`austa-analytics-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    setShowExportMenu(false);
  };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['AUSTA Cockpit - Relatório Analítico'],
      [`Período: ${format(exportOptions.dateRange.start, 'dd/MM/yyyy')} - ${format(exportOptions.dateRange.end, 'dd/MM/yyyy')}`],
      [],
      ['Resumo Executivo'],
      ['Métrica', 'Valor'],
      ['Total de Casos', mockExportData.summary.totalCases],
      ['Casos Aprovados', mockExportData.summary.approvedCases],
      ['Casos Negados', mockExportData.summary.deniedCases],
      ['Tempo Médio de Processamento (min)', mockExportData.summary.avgProcessingTime],
      ['Taxa de Detecção de Fraudes (%)', mockExportData.summary.fraudDetectionRate],
      ['Score de Confiança IA (%)', mockExportData.summary.aiConfidenceScore]
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Resumo');
    
    // Auditor performance sheet
    const auditorSheet = XLSX.utils.json_to_sheet(mockExportData.auditors);
    XLSX.utils.book_append_sheet(wb, auditorSheet, 'Auditores');
    
    // Daily metrics sheet
    const dailySheet = XLSX.utils.json_to_sheet(mockExportData.dailyMetrics);
    XLSX.utils.book_append_sheet(wb, dailySheet, 'Métricas Diárias');
    
    // Save the Excel file
    XLSX.writeFile(wb, `austa-analytics-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    setShowExportMenu(false);
  };

  const csvData = [
    ['Data', 'Casos', 'Taxa de Aprovação (%)', 'Tempo Médio (min)'],
    ...mockExportData.dailyMetrics.map(d => [
      d.date,
      d.cases.toString(),
      d.approvalRate.toFixed(1),
      d.avgTime.toFixed(1)
    ])
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setShowExportMenu(!showExportMenu)}
        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Exportar
      </button>

      {showExportMenu && (
        <div className="absolute right-0 top-12 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 z-50">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Opções de Exportação
          </h3>

          {/* Format Selection */}
          <div className="mb-4">
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
              Formato
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['pdf', 'excel', 'csv'] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => setExportOptions({ ...exportOptions, format })}
                  className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
                    exportOptions.format === format
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics Selection */}
          <div className="mb-4">
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
              Métricas a Incluir
            </label>
            <div className="space-y-1">
              {[
                { id: 'cases', label: 'Análise de Casos' },
                { id: 'performance', label: 'Performance dos Auditores' },
                { id: 'fraud', label: 'Detecção de Fraudes' },
                { id: 'ai', label: 'Métricas de IA' }
              ].map((metric) => (
                <label key={metric.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.metrics.includes(metric.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setExportOptions({
                          ...exportOptions,
                          metrics: [...exportOptions.metrics, metric.id]
                        });
                      } else {
                        setExportOptions({
                          ...exportOptions,
                          metrics: exportOptions.metrics.filter(m => m !== metric.id)
                        });
                      }
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-700 dark:text-gray-300">
                    {metric.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Include Charts Option */}
          {exportOptions.format === 'pdf' && (
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOptions.includeCharts}
                onChange={(e) => setExportOptions({ ...exportOptions, includeCharts: e.target.checked })}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">
                Incluir gráficos
              </span>
            </label>
          )}

          {/* Export Button */}
          <div className="flex gap-2">
            {exportOptions.format === 'pdf' && (
              <button
                onClick={handleExportPDF}
                className="flex-1 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Exportar PDF
              </button>
            )}
            {exportOptions.format === 'excel' && (
              <button
                onClick={handleExportExcel}
                className="flex-1 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Exportar Excel
              </button>
            )}
            {exportOptions.format === 'csv' && (
              <CSVLink
                data={csvData}
                filename={`austa-analytics-${format(new Date(), 'yyyy-MM-dd')}.csv`}
                className="flex-1 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors text-center block"
                onClick={() => setShowExportMenu(false)}
              >
                Exportar CSV
              </CSVLink>
            )}
            <button
              onClick={() => setShowExportMenu(false)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportControls;