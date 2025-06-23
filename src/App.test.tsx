import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { store } from './store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          {ui}
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  );
};

describe('App', () => {
  test('renders AUSTA Cockpit heading', () => {
    renderWithProviders(<App />);
    const heading = screen.getByText('AUSTA Cockpit');
    expect(heading).toBeInTheDocument();
  });

  test('renders platform description', () => {
    renderWithProviders(<App />);
    const description = screen.getByText(/Platform for human and AI interaction/i);
    expect(description).toBeInTheDocument();
  });
});