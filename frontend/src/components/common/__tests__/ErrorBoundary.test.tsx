import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@/test/test-utils';
import { Component } from 'react';
import ErrorBoundary from '../ErrorBoundary';

// Mock console methods to avoid cluttering test output
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Component that throws an error in useEffect
const ThrowErrorInEffect = () => {
  React.useEffect(() => {
    throw new Error('Effect error');
  }, []);
  return <div>Component with effect</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders error UI when child component throws', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Test error/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('renders fallback component when provided', () => {
    const FallbackComponent = ({ error }: { error: Error }) => (
      <div>Custom error: {error.message}</div>
    );
    
    render(
      <ErrorBoundary fallback={FallbackComponent}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Custom error: Test error')).toBeInTheDocument();
  });

  it('calls onError callback when error occurs', () => {
    const onError = vi.fn();
    
    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );
  });

  it('reloads page when reload button is clicked', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      writable: true,
    });
    
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    const reloadButton = screen.getByRole('button', { name: /reload page/i });
    fireEvent.click(reloadButton);
    
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('logs error to console in development', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('recovers when error is cleared', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('handles errors from async components', async () => {
    const AsyncError = () => {
      const [shouldThrow, setShouldThrow] = React.useState(false);
      
      React.useEffect(() => {
        setTimeout(() => setShouldThrow(true), 0);
      }, []);
      
      if (shouldThrow) throw new Error('Async error');
      return <div>Loading...</div>;
    };
    
    render(
      <ErrorBoundary>
        <AsyncError />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    
    // Wait for the error to be thrown
    await screen.findByText(/Something went wrong/i);
    expect(screen.getByText(/Async error/i)).toBeInTheDocument();
  });

  it('displays error stack in development mode', () => {
    const error = new Error('Stack trace error');
    error.stack = 'Error: Stack trace error\n    at TestComponent.render';
    
    class TestComponent extends Component {
      componentDidMount() {
        throw error;
      }
      render() {
        return <div>Test</div>;
      }
    }
    
    render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/Stack trace error/i)).toBeInTheDocument();
  });

  it('handles errors without message gracefully', () => {
    const errorWithoutMessage = new Error();
    
    class TestComponent extends Component {
      componentDidMount() {
        throw errorWithoutMessage;
      }
      render() {
        return <div>Test</div>;
      }
    }
    
    render(
      <ErrorBoundary>
        <TestComponent />
      </ErrorBoundary>
    );
    
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/i)).toBeInTheDocument();
  });
});

// Add import for React at the top of the file
import React from 'react';