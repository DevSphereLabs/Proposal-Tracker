'use client';

import { useState } from 'react';
import type { ProposalDetails } from '@/types';

// Step 1 of the proposal request flow: the project details form.
// Owns its own field state and validation; on success it hands the values up
// to the parent via onSubmit, which submits the proposal (no account required).
//
// For a signed-in client the parent passes their profile as `initial`, locks
// the email (it's what ties the request to their account), and drops the
// consent checkbox since they agreed to it when they registered.
//
// `variant` picks the styling: 'intake' sits on the home page's blue card,
// 'portal' matches the gray cards on the client dashboard.
const STYLES = {
  intake: {
    label: 'block text-black text-sm mb-1',
    required: 'text-red-300',
    input: 'w-full rounded-md px-3 py-2 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-500',
    note: 'text-blue-100 text-xs mt-1',
    error: 'text-red-200 text-xs mt-1',
    submitError: 'text-red-200 text-sm',
    buttonWrap: '',
    button: 'w-full bg-blue-950 text-white font-semibold py-3 rounded-md mt-2 disabled:opacity-50',
  },
  portal: {
    label: 'block font-bold text-black text-sm mb-1',
    required: 'text-red-500',
    input: 'w-full rounded-md px-3 py-2 bg-white border border-gray-300 text-black text-sm disabled:bg-gray-200 disabled:text-gray-500',
    note: 'text-gray-500 text-xs mt-1',
    error: 'text-red-600 text-xs mt-1',
    submitError: 'text-red-600 text-sm',
    buttonWrap: 'flex justify-end pt-2',
    button: 'bg-blue-950 text-white font-semibold text-sm px-8 py-2.5 rounded-full disabled:opacity-50',
  },
} as const;

export default function ProposalDetailsForm({
  onSubmit,
  isSubmitting,
  submitError,
  initial,
  lockEmail = false,
  requireConsent = true,
  variant = 'intake',
}: {
  onSubmit: (details: ProposalDetails) => void;
  isSubmitting: boolean;
  submitError: boolean;
  initial?: Partial<ProposalDetails>;
  lockEmail?: boolean;
  requireConsent?: boolean;
  variant?: keyof typeof STYLES;
}) {
  const css = STYLES[variant];

  // Field values
  const [projectType, setProjectType] = useState(initial?.projectType ?? '');
  const [timeline, setTimeline] = useState(initial?.timeline ?? '');
  const [firstName, setFirstName] = useState(initial?.firstName ?? '');
  const [lastName, setLastName] = useState(initial?.lastName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [budget, setBudget] = useState(initial?.budget ?? '');
  const [companyName, setCompanyName] = useState(initial?.companyName ?? '');
  const [projectDetails, setProjectDetails] = useState(initial?.projectDetails ?? '');
  const [consent, setConsent] = useState(false);

  // Validation error messages (empty string means no error)
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [companyNameError, setCompanyNameError] = useState('');
  const [projectDetailsError, setProjectDetailsError] = useState('');
  const [consentError, setConsentError] = useState('');

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    // Clear all errors before re-validating
    setFirstNameError('');
    setLastNameError('');
    setEmailError('');
    setCompanyNameError('');
    setProjectDetailsError('');
    setConsentError('');

    let hasErrors = false;

    if (firstName.trim() === '') {
      setFirstNameError('First name is required.');
      hasErrors = true;
    }

    if (lastName.trim() === '') {
      setLastNameError('Last name is required.');
      hasErrors = true;
    }

    if (email.trim() === '') {
      setEmailError('Email is required.');
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address.');
      hasErrors = true;
    }

    if (companyName.trim() === '') {
      setCompanyNameError('Company name is required.');
      hasErrors = true;
    }

    if (projectDetails.trim() === '') {
      setProjectDetailsError('Project details are required.');
      hasErrors = true;
    }

    if (requireConsent && !consent) {
      setConsentError('You must accept this to submit.');
      hasErrors = true;
    }

    if (hasErrors) return;

    onSubmit({
      projectType,
      timeline,
      firstName,
      lastName,
      email,
      budget,
      companyName,
      projectDetails,
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>

      {/* Row 1: Project Type and Time Line */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={css.label}>Project Type</label>
          <select
            className={css.input}
            value={projectType}
            onChange={(e) => setProjectType(e.target.value)}
          >
            <option value="">Project Type</option>
            <option value="web">Web Development</option>
            <option value="mobile">Mobile App</option>
            <option value="fullstack">Full Stack Web App</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={css.label}>Time Line</label>
          <select
            className={css.input}
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
          >
            <option value="">Time Line</option>
            <option value="asap">ASAP</option>
            <option value="1-3-months">1-3 months</option>
            <option value="3-6-months">3-6 months</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
      </div>

      {/* Row 2: First Name and Last Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={css.label}>
            First Name <span className={css.required}>*</span>
          </label>
          <input
            type="text"
            placeholder="First Name"
            className={css.input}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          {firstNameError && <p className={css.error}>{firstNameError}</p>}
        </div>
        <div>
          <label className={css.label}>
            Last Name <span className={css.required}>*</span>
          </label>
          <input
            type="text"
            placeholder="Last Name"
            className={css.input}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
          {lastNameError && <p className={css.error}>{lastNameError}</p>}
        </div>
      </div>

      {/* Row 3: Email and Budget */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={css.label}>
            Email <span className={css.required}>*</span>
          </label>
          <input
            type="email"
            placeholder="Email Address"
            className={css.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={lockEmail}
          />
          {lockEmail && (
            <p className={css.note}>Linked to your account.</p>
          )}
          {emailError && <p className={css.error}>{emailError}</p>}
        </div>
        <div>
          <label className={css.label}>Budget</label>
          <select
            className={css.input}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          >
            <option value="">Budget</option>
            <option value="under-5k">Under $5k</option>
            <option value="5k-15k">$5k - $15k</option>
            <option value="15k-50k">$15k - $50k</option>
            <option value="50k-plus">$50k+</option>
            <option value="not-sure">Not sure yet</option>
          </select>
        </div>
      </div>

      {/* Row 4: Company Name (full width) */}
      <div>
        <label className={css.label}>
          Company Name <span className={css.required}>*</span>
        </label>
        <input
          type="text"
          placeholder="Company Name"
          className={css.input}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
        {companyNameError && <p className={css.error}>{companyNameError}</p>}
      </div>

      {/* Row 5: Project Details (full width, textarea) */}
      <div>
        <label className={css.label}>
          Project Details <span className={css.required}>*</span>
        </label>
        <textarea
          placeholder="What can we help you with?"
          rows={4}
          className={`${css.input} resize-none`}
          value={projectDetails}
          onChange={(e) => setProjectDetails(e.target.value)}
        />
        {projectDetailsError && <p className={css.error}>{projectDetailsError}</p>}
      </div>

      {/* Consent checkbox (first-time visitors only) */}
      {requireConsent && (
        <div className="flex items-start gap-2 pt-2">
          <input
            type="checkbox"
            id="consent"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <div>
            <label htmlFor="consent" className="text-black text-xs">
              I consent to Proposal Tracker storing my information so they can respond to my inquiry
            </label>
            {consentError && <p className={css.error}>{consentError}</p>}
          </div>
        </div>
      )}

      {/* Submission error */}
      {submitError && (
        <p className={css.submitError}>
          Something went wrong submitting your proposal. Please try again.
        </p>
      )}

      {/* Submit button */}
      <div className={css.buttonWrap}>
        <button type="submit" disabled={isSubmitting} className={css.button}>
          {isSubmitting ? 'Submitting...' : 'Submit Proposal'}
        </button>
      </div>

    </form>
  );
}
