'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import DashboardNav from '@/components/DashboardNav';
import Footer from '@/components/Footer';
import ProposalIntro from '@/components/ProposalIntro';
import ProposalDetailsForm from '@/components/ProposalDetailsForm';
import CreateAccountForm from '@/components/CreateAccountForm';
import ProposalSentModal from '@/components/ProposalSentModal';
import {
  ApiError,
  clearSession,
  getMe,
  getSessionSnapshot,
  registerAndSignIn,
  submitProposal,
  subscribeSession,
  type SessionUser,
} from '@/lib/api';
import type { AccountDetails, ClientProfile, ProposalDetails } from '@/types';

// Public home page: the proposal intake flow. Anyone can submit a proposal
// without an account; afterward they may optionally create one to track it.
// Returning clients use the sign-in link to reach their portal at /dashboard.
//
// A client who is already signed in stays signed in here: the page wears the
// client nav, the form starts filled in from their profile, and a submitted
// request goes straight to their portal (no account step).
export default function HomePage() {
  // Which step of the flow is showing: the project form, the optional
  // create-account card, or the "sent" confirmation popup
  const [step, setStep] = useState<'details' | 'account' | 'sent'>('details');
  const [details, setDetails] = useState<ProposalDetails | null>(null);
  // True once an account was created, so the confirmation can link to the portal
  const [accountCreated, setAccountCreated] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  const [accountError, setAccountError] = useState(false);

  // Signed-in client (if any) from the session store. Server-renders as null
  // and updates on sign-in/out via the store subscription. Team members get
  // the public form: the portal side of this page is for clients only.
  const raw = useSyncExternalStore(subscribeSession, getSessionSnapshot, () => null);
  const client = useMemo<SessionUser | null>(() => {
    if (!raw) return null;
    try {
      const user = JSON.parse(raw) as SessionUser;
      return user.role === 'CLIENT' ? user : null;
    } catch {
      return null;
    }
  }, [raw]);
  const signedIn = client !== null;

  // The signed-in client's profile, used to prefill the form. Only counts
  // while it belongs to the current session, so signing out (or in as
  // someone else) never shows a previous client's details.
  const [loadedProfile, setLoadedProfile] = useState<ClientProfile | null>(null);
  const profile = client && loadedProfile?.email === client.email ? loadedProfile : null;

  useEffect(() => {
    if (!client) return;

    let active = true;

    getMe()
      .then((me) => {
        if (active) setLoadedProfile(me);
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          // Stale token: drop the session so the public form shows instead
          clearSession();
        } else if (active) {
          // Fall back to what the session already knows
          setLoadedProfile({
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            phone: '',
            companyName: '',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [client]);

  // Step 1: submit the proposal (no account needed), then offer the account
  // step — unless the client is signed in, in which case the request is
  // already tied to their account (by email) and the confirmation is next
  async function handleSubmitProposal(values: ProposalDetails) {
    setDetailsError(false);
    setIsSubmitting(true);

    try {
      await submitProposal(values);
      setDetails(values);
      setStep(signedIn ? 'sent' : 'account');
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
      setAccountCreated(true);
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
    setAccountCreated(false);
    setDetailsError(false);
    setAccountError(false);
  }

  // Hold the form for a signed-in client until their profile is in, so its
  // fields start out filled rather than snapping in after the fact
  const formReady = !signedIn || profile !== null;

  return (
    <div className="min-h-screen flex flex-col">
      {signedIn && <DashboardNav />}

      <main className="flex-1 bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-6xl w-full">
          <p className="text-sm text-black">New Proposal Request</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-2">

            <ProposalIntro signedInAs={signedIn ? (profile?.email ?? client.email) : null} />

            {/* Right column: the form card */}
            <section className="bg-blue-500 rounded-2xl p-8">
              {step === 'details' ? (
                formReady ? (
                  <ProposalDetailsForm
                    // Remount when the profile changes so the fields re-seed
                    key={profile?.email ?? 'guest'}
                    initial={
                      profile
                        ? {
                            firstName: profile.firstName,
                            lastName: profile.lastName,
                            email: profile.email,
                            companyName: profile.companyName,
                          }
                        : undefined
                    }
                    lockEmail={signedIn}
                    requireConsent={!signedIn}
                    onSubmit={handleSubmitProposal}
                    isSubmitting={isSubmitting}
                    submitError={detailsError}
                  />
                ) : (
                  <p className="text-white text-center py-16">Loading your details...</p>
                )
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
        <ProposalSentModal
          open={step === 'sent'}
          signedIn={signedIn || accountCreated}
          onDone={handleReset}
        />
      </main>

      {signedIn && <Footer />}
    </div>
  );
}
