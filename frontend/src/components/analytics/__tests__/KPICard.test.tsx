import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { KPICard } from '../KPICard';

describe('KPICard', () => {
  const defaultProps = {
    title: 'Total Cases',
    value: 42,
    icon: 'cases',
    trend: 15,
    trendDirection: 'up' as const,
  };

  it('renders the KPI card with all props', () => {
    render(<KPICard {...defaultProps} />);
    
    expect(screen.getByText('Total Cases')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('+15%')).toBeInTheDocument();
  });

  it('shows negative trend correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        trend={-10}
        trendDirection="down"
      />
    );
    
    expect(screen.getByText('-10%')).toBeInTheDocument();
  });

  it('handles zero trend', () => {
    render(
      <KPICard
        {...defaultProps}
        trend={0}
        trendDirection="neutral"
      />
    );
    
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('formats large numbers correctly', () => {
    render(
      <KPICard
        {...defaultProps}
        value={1234567}
      />
    );
    
    // Assuming the component formats large numbers
    expect(screen.getByText(/1\.23M|1,234,567/)).toBeInTheDocument();
  });

  it('renders without trend data', () => {
    const { trend, trendDirection, ...propsWithoutTrend } = defaultProps;
    render(<KPICard {...propsWithoutTrend} />);
    
    expect(screen.getByText('Total Cases')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});