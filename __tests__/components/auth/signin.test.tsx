import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import SignInPage from '@/app/auth/signin/page'
import { toast } from 'sonner'

// Mock dependencies
jest.mock('next-auth/react')
jest.mock('next/navigation')
jest.mock('sonner')

describe('SignInPage', () => {
  const mockPush = jest.fn()
  const mockSignIn = signIn as jest.MockedFunction<typeof signIn>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
    })
  })

  it('should render sign in form', () => {
    render(<SignInPage />)

    expect(screen.getByText('Welcome back')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('should render OAuth buttons', () => {
    render(<SignInPage />)

    expect(screen.getByRole('button', { name: /continue with github/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
  })

  it('should handle successful email/password sign in', async () => {
    mockSignIn.mockResolvedValue({ error: null, ok: true } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      })
    })

    expect(toast.success).toHaveBeenCalledWith('Welcome back!')
    expect(mockPush).toHaveBeenCalledWith('/dashboard')
  })

  it('should handle sign in error', async () => {
    mockSignIn.mockResolvedValue({ error: 'Invalid credentials', ok: false } as any)

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid email or password')
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should handle GitHub OAuth sign in', async () => {
    mockSignIn.mockResolvedValue({ error: null, ok: true } as any)

    render(<SignInPage />)

    const githubButton = screen.getByRole('button', { name: /continue with github/i })
    fireEvent.click(githubButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('github', { callbackUrl: '/dashboard' })
    })
  })

  it('should handle Google OAuth sign in', async () => {
    mockSignIn.mockResolvedValue({ error: null, ok: true } as any)

    render(<SignInPage />)

    const googleButton = screen.getByRole('button', { name: /continue with google/i })
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard' })
    })
  })

  it('should show loading state during sign in', async () => {
    mockSignIn.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ error: null, ok: true } as any), 100))
    )

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    // Check for loading state
    await waitFor(() => {
      expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    })
  })

  it('should disable buttons during loading', async () => {
    mockSignIn.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ error: null, ok: true } as any), 100))
    )

    render(<SignInPage />)

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    const githubButton = screen.getByRole('button', { name: /continue with github/i })
    const googleButton = screen.getByRole('button', { name: /continue with google/i })

    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(submitButton).toBeDisabled()
      expect(githubButton).toBeDisabled()
      expect(googleButton).toBeDisabled()
    })
  })

  it('should have link to sign up page', () => {
    render(<SignInPage />)

    const signUpLink = screen.getByRole('link', { name: /sign up/i })
    expect(signUpLink).toHaveAttribute('href', '/auth/signup')
  })

  it('should have forgot password link', () => {
    render(<SignInPage />)

    const forgotPasswordLink = screen.getByRole('link', { name: /forgot password/i })
    expect(forgotPasswordLink).toHaveAttribute('href', '/auth/forgot-password')
  })

  it('should handle unexpected errors gracefully', async () => {
    mockSignIn.mockRejectedValue(new Error('Network error'))

    render(<SignInPage />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong')
    })
  })
})
