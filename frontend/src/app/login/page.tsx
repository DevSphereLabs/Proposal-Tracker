'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UserIcon } from '@/components/icons';
import { login } from '@/lib/api';

// Sign-in page for returning clients, reached from the "Sign in" link on
// the home page. Styled to match the proposal request cards.
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    setEmailError('');
    setPasswordError('');
    setFormError('');

    let hasErrors = false;

    if (email.trim() === '') {
      setEmailError('Email is required.');
      hasErrors = true;
    }

    if (password === '') {
      setPasswordError('Password is required.');
      hasErrors = true;
    }

    if (hasErrors) return;

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      // Clients land on their portal; team members on the proposal manager
      router.push(user.role === 'CLIENT' ? '/dashboard' : '/team');
    } catch {
      setFormError('Incorrect email or password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <section className="bg-blue-500 rounded-2xl p-8 max-w-md w-full">
        <form onSubmit={handleSubmit}>
          <h1 className="text-2xl font-bold text-black text-center">Sign In</h1>

          {/* Avatar badge */}
          <div className="w-28 h-28 rounded-full bg-gray-100 flex items-center justify-center mx-auto my-6">
            <UserIcon className="w-16 h-16 text-blue-900" />
          </div>

          <p className="text-black text-center font-medium mb-6">
            Welcome Back!
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-black text-sm mb-1">
                Email <span className="text-red-300">*</span>
              </label>
              <input
                type="email"
                placeholder="Email"
                className="w-full rounded-md px-3 py-2 bg-white text-gray-700"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailError && <p className="text-red-200 text-xs mt-1">{emailError}</p>}
            </div>

            <div>
              <label className="block text-black text-sm mb-1">
                Password <span className="text-red-300">*</span>
              </label>
              <input
                type="password"
                placeholder="Password"
                className="w-full rounded-md px-3 py-2 bg-white text-gray-700"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError && <p className="text-red-200 text-xs mt-1">{passwordError}</p>}
            </div>
          </div>

          {formError && <p className="text-red-200 text-sm mt-4">{formError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-950 text-white font-semibold py-3 rounded-md mt-6 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </button>

          <p className="text-black text-xs text-center mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/" className="text-blue-100 underline">
              Request a proposal
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
