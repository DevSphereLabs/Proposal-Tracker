'use client';

import { useState } from 'react';
import ProposalIntro from '@/components/ProposalIntro';
import ProposalDetailsForm from '@/components/ProposalDetailsForm';
import CreateAccountForm from '@/components/CreateAccountForm';
import ProposalSentModal from '@/components/ProposalSentModal';
import { registerAndSignIn, submitProposal } from '@/lib/api';
import type { ProposalDetails, AccountDetails } from '@/types';

// Public home page: the proposal intake flow. Anyone can submit a proposal
// without an account; afterward they may optionally create one to track it.
// Returning clients use the sign-in link to reach their portal at /dashboard.
export default function HomePage() {
  // Which step of the flow is showing: the project form, the optional
  // create-account card, or the "sent" confirmation popup
  const [step, setStep] = useState<'details' | 'account' | 'sent'>('details');
  const [details, setDetails] = useState<ProposalDetails | null>(null);
  // True once an account was created, so the confirmation can link to the portal
  const [signedIn, setSignedIn] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [accountError, setAccountError] = useState(false);

  // Step 1: submit the proposal (no account needed), then offer the account step
  async function handleSubmitProposal(values: ProposalDetails) {
    setDetailsError(false);
    setIsSubmitting(true);

    try {
      await submitProposal(values);
      setDetails(values);
      setStep('account');
    } catch {
      setDetailsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Step 2 (optional): create an account for the proposal just submitted
  async function handleCreateAccount(account: AccountDetails) {
    if (!details) return;

    setAccountError(false);
    setIsSubmitting(true);

    try {
      await registerAndSignIn(details, account.password);
      setSignedIn(true);
      setStep('sent');
    } catch {
      setAccountError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Skip the account step — the proposal is already submitted
  function handleSkipAccount() {
    setStep('sent');
  }

  // Back to a fresh intake form after finishing without an account
  function handleReset() {
    setStep('details');
    setDetails(null);
    setSignedIn(false);
    setDetailsError(false);
    setAccountError(false);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-6xl w-full">
          <p className="text-sm text-black">New Proposal Request</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-2">

            <ProposalIntro />

            {/* Right column: the form card */}
            <section className="bg-blue-500 rounded-2xl p-8">
              {step === 'details' ? (
                <ProposalDetailsForm
                  onSubmit={handleSubmitProposal}
                  isSubmitting={isSubmitting}
                  submitError={detailsError}
                />
              ) : (
                <CreateAccountForm
                  onSubmit={handleCreateAccount}
                  onSkip={handleSkipAccount}
                  isSubmitting={isSubmitting}
                  submitError={accountError}
                />
              )}
            </section>

          </div>
        </div>

        {/* Success popup */}
        <ProposalSentModal open={step === 'sent'} signedIn={signedIn} onDone={handleReset} />
      </main>
    </div>
  );
}
