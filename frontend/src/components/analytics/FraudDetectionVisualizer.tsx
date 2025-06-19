import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { FraudPattern } from '../../types/analytics';

interface FraudDetectionVisualizerProps {
  riskLevel?: 'high' | 'medium' | 'low';
}

const FraudDetectionVisualizer: React.FC<FraudDetectionVisualizerProps> = ({ riskLevel }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedPattern, setSelectedPattern] = useState<FraudPattern | null>(null);
  
  // Mock fraud patterns data
  const fraudPatterns: FraudPattern[] = [
    {
      id: '1',
      type: 'Billing Anomaly',
      riskScore: 92,
      occurrences: 23,
      description: 'Unusual billing patterns detected',
      detectedDate: new Date(),
      providers: ['Provider A', 'Provider B']
    },
    {
      id: '2',
      type: 'Duplicate Claims',
      riskScore: 78,
      occurrences: 15,
      description: 'Multiple similar claims submitted',
      detectedDate: new Date(),
      providers: ['Provider C']
    },
    {
      id: '3',
      type: 'Unusual Frequency',
      riskScore: 65,
      occurrences: 31,
      description: 'Abnormal procedure frequency',
      detectedDate: new Date(),
      providers: ['Provider D', 'Provider E', 'Provider F']
    },
    {
      id: '4',
      type: 'Network Analysis',
      riskScore: 85,
      occurrences: 12,
      description: 'Suspicious provider network activity',
      detectedDate: new Date(),
      providers: ['Provider G']
    }
  ];

  // Create network visualization with D3
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 300;
    const height = 300;
    const centerX = width / 2;
    const centerY = height / 2;

    // Create main group
    const g = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${centerX}, ${centerY})`);

    // Create nodes data
    const nodes = fraudPatterns.map((pattern, i) => ({
      ...pattern,
      x: Math.cos((i * 2 * Math.PI) / fraudPatterns.length) * 100,
      y: Math.sin((i * 2 * Math.PI) / fraudPatterns.length) * 100,
      radius: Math.sqrt(pattern.riskScore) * 3
    }));

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('charge', d3.forceManyBody().strength(-50))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius((d: any) => d.radius + 5));

    // Add links (connections between high-risk patterns)
    const links = nodes
      .filter(n => n.riskScore > 80)
      .map((source, i, arr) => 
        arr.slice(i + 1).map(target => ({ source, target }))
      )
      .flat();

    // Draw links
    const link = g.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', '#ef4444')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1);

    // Draw nodes
    const node = g.selectAll('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (_, d) => setSelectedPattern(d as FraudPattern));

    // Add circles
    node.append('circle')
      .attr('r', (d: any) => d.radius)
      .attr('fill', (d: any) => {
        if (d.riskScore > 80) return '#ef4444';
        if (d.riskScore > 60) return '#f59e0b';
        return '#10b981';
      })
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add labels
    node.append('text')
      .text((d: any) => d.type.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .style('font-size', '10px')
      .style('fill', '#fff')
      .style('font-weight', 'bold');

    // Add risk score labels
    node.append('text')
      .text((d: any) => d.riskScore)
      .attr('text-anchor', 'middle')
      .attr('dy', '1.5em')
      .style('font-size', '8px')
      .style('fill', '#fff');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);
    });

    // Add hover effects
    node
      .on('mouseenter', function() {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', (d: any) => d.radius * 1.2);
      })
      .on('mouseleave', function() {
        d3.select(this).select('circle')
          .transition()
          .duration(200)
          .attr('r', (d: any) => d.radius);
      });

  }, [riskLevel]);

  // Risk level indicator
  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div>
      {/* Risk Level Indicator */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getRiskLevelColor(riskLevel || 'low')} animate-pulse`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Nível de Risco: {riskLevel ? riskLevel.toUpperCase() : 'BAIXO'}
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {fraudPatterns.reduce((acc, p) => acc + p.occurrences, 0)} padrões detectados
        </span>
      </div>

      {/* Network Visualization */}
      <div className="flex justify-center mb-4">
        <svg ref={svgRef} className="bg-gray-50 dark:bg-gray-800 rounded-lg" />
      </div>

      {/* Pattern Details */}
      {selectedPattern && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-900 dark:text-white">
              {selectedPattern.type}
            </h4>
            <button
              onClick={() => setSelectedPattern(null)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {selectedPattern.description}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Risk Score:</span>
              <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                {selectedPattern.riskScore}%
              </span>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Ocorrências:</span>
              <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                {selectedPattern.occurrences}
              </span>
            </div>
          </div>
          {selectedPattern.providers && selectedPattern.providers.length > 0 && (
            <div className="mt-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Provedores:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedPattern.providers.map((provider, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                  >
                    {provider}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
          <div className="text-xs text-red-600 dark:text-red-400">Alto Risco</div>
          <div className="text-xl font-bold text-red-700 dark:text-red-300">
            {fraudPatterns.filter(p => p.riskScore > 80).length}
          </div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
          <div className="text-xs text-yellow-600 dark:text-yellow-400">Médio Risco</div>
          <div className="text-xl font-bold text-yellow-700 dark:text-yellow-300">
            {fraudPatterns.filter(p => p.riskScore > 60 && p.riskScore <= 80).length}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FraudDetectionVisualizer;