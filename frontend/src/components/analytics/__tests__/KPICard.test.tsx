import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import KPICard from '../KPICard';
import type { KPIMetric } from '@/types/analytics';

describe('KPICard', () => {
  const defaultMetric: KPIMetric = {
    id: '1',
    name: 'Total Cases',
    value: 42,
    target: 50,
    percentage: 15,
    trend: 'up',
    period: 'daily'
  };

  const defaultProps = {
    metric: defaultMetric
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
        metric={{
          ...defaultMetric,
          percentage: -10,
          trend: 'down'
        }}
      />
    );
    
    expect(screen.getByText('-10%')).toBeInTheDocument();
  });

  it('handles zero trend', () => {
    render(
      <KPICard
        metric={{
          ...defaultMetric,
          percentage: 0,
          trend: 'stable'
        }}
      />
    );
    
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('formats target correctly', () => {
    render(
      <KPICard
        metric={{
          ...defaultMetric,
          target: 100
        }}
      />
    );
    
    expect(screen.getByText(/Meta: 100/)).toBeInTheDocument();
  });

  it('applies selected styles when isSelected is true', () => {
    const { container } = render(
      <KPICard {...defaultProps} isSelected={true} />
    );
    
    const card = container.firstChild;
    expect(card).toHaveClass('ring-2', 'ring-blue-500');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<KPICard {...defaultProps} onClick={handleClick} />);
    
    const card = screen.getByText('Total Cases').closest('div');
    card?.click();
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});