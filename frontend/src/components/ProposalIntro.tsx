import Link from 'next/link';
import { ClipboardIcon, BoltIcon, LockIcon } from '@/components/icons';

// Left column of the home page's proposal request flow: the headline,
// the three selling points, and a sign-in link for returning clients (or,
// when a client is already signed in, a link back to their portal).
const HIGHLIGHTS = [
  {
    icon: ClipboardIcon,
    title: 'Personalized Proposal',
    description: 'We tailor every proposal to your needs',
  },
  {
    icon: BoltIcon,
    title: 'Fast Response',
    description: 'Typically responds within 1 business day',
  },
  {
    icon: LockIcon,
    title: 'Secure & Confidential',
    description: 'Your information and ideas are safe with us',
  },
];

export default function ProposalIntro({ signedInAs }: { signedInAs?: string | null }) {
  return (
    <section>
      {/* Headline and supporting copy */}
      <h1 className="text-5xl font-bold text-black">
        Tell Us About<br />Your Project
      </h1>
      <p className="mt-4 text-black">
        Fill out the form below and our team will review it and get back to you shortly.
      </p>

      {/* Feature highlights, one row per selling point */}
      <div className="mt-10 space-y-6">
        {HIGHLIGHTS.map((item) => (
          <div key={item.title} className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <item.icon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-black">{item.title}</h3>
              <p className="text-sm text-black">{item.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Signed-in clients get a way back to their portal; everyone else a
          sign-in link */}
      <div className="mt-10">
        {signedInAs ? (
          <>
            <p className="font-semibold text-black text-sm">Signed in as {signedInAs}</p>
            <Link href="/dashboard" className="text-blue-600 text-sm underline">
              Go to my dashboard
            </Link>
          </>
        ) : (
          <>
            <p className="font-semibold text-black text-sm">Have an account ?</p>
            <Link href="/login" className="text-blue-600 text-sm underline">
              Sign in
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
