import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../LoginForm';

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

// Mock auth service
vi.mock('@/services/authService', () => ({
  useLoginMutation: vi.fn(() => [
    vi.fn().mockResolvedValue({ data: { accessToken: 'token', user: { id: '1' } } }),
    { isLoading: false, error: null }
  ]),
}));

describe('LoginForm', () => {
  const mockNavigate = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as any).mockReturnValue(mockNavigate);
  });

  it('renders login form with all fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByText(/don't have an account/i)).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    });
  });

  it('validates email format', async () => {
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    await user.type(emailInput, 'invalid-email');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
    });
  });

  it('validates minimum password length', async () => {
    render(<LoginForm />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, '12345');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility', async () => {
    render(<LoginForm />);
    
    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
    
    const toggleButton = screen.getByLabelText(/toggle password visibility/i);
    await user.click(toggleButton);
    
    expect(passwordInput).toHaveAttribute('type', 'text');
    
    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('submits form with valid data', async () => {
    const mockLogin = vi.fn().mockResolvedValue({ 
      data: { 
        accessToken: 'token', 
        user: { id: '1', email: 'test@example.com' } 
      } 
    });
    
    vi.mocked(require('@/services/authService').useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, error: null }
    ]);
    
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message on login failure', async () => {
    const mockLogin = vi.fn().mockRejectedValue({
      data: { message: 'Invalid credentials' }
    });
    
    vi.mocked(require('@/services/authService').useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, error: { data: { message: 'Invalid credentials' } } }
    ]);
    
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'wrongpassword');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    vi.mocked(require('@/services/authService').useLoginMutation).mockReturnValue([
      vi.fn(),
      { isLoading: true, error: null }
    ]);
    
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /logging in/i });
    
    expect(emailInput).toBeDisabled();
    expect(passwordInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });

  it('handles MFA requirement', async () => {
    const mockLogin = vi.fn().mockResolvedValue({ 
      data: { 
        requiresMFA: true, 
        userId: '123',
        message: 'MFA required'
      } 
    });
    
    vi.mocked(require('@/services/authService').useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, error: null }
    ]);
    
    render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/enter your 6-digit code/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/mfa code/i)).toBeInTheDocument();
    });
  });

  it('handles remember me checkbox', async () => {
    render(<LoginForm />);
    
    const rememberMeCheckbox = screen.getByLabelText(/remember me/i);
    expect(rememberMeCheckbox).not.toBeChecked();
    
    await user.click(rememberMeCheckbox);
    expect(rememberMeCheckbox).toBeChecked();
  });

  it('navigates to register page', async () => {
    render(<LoginForm />);
    
    const registerLink = screen.getByText(/sign up/i);
    await user.click(registerLink);
    
    expect(mockNavigate).toHaveBeenCalledWith('/register');
  });

  it('navigates to forgot password page', async () => {
    render(<LoginForm />);
    
    const forgotPasswordLink = screen.getByText(/forgot password/i);
    await user.click(forgotPasswordLink);
    
    expect(mockNavigate).toHaveBeenCalledWith('/forgot-password');
  });

  it('clears form on successful login', async () => {
    const mockLogin = vi.fn().mockResolvedValue({ 
      data: { 
        accessToken: 'token', 
        user: { id: '1', email: 'test@example.com' } 
      } 
    });
    
    vi.mocked(require('@/services/authService').useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, error: null }
    ]);
    
    const { rerender } = render(<LoginForm />);
    
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');
    
    const submitButton = screen.getByRole('button', { name: /log in/i });
    await user.click(submitButton);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    
    // Re-render to simulate navigation back
    rerender(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    expect(screen.getByLabelText(/password/i)).toHaveValue('');
  });
});