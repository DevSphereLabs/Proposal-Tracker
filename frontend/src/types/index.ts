// Shapes shared between the dashboard proposal-request steps.
// Grow this file as backend models come online (Submission, Proposal, User, etc.).

export interface ProposalDetails {
  projectType: string;
  timeline: string;
  firstName: string;
  lastName: string;
  email: string;
  budget: string;
  companyName: string;
  projectDetails: string;
}

export interface AccountDetails {
  username: string;
  password: string;
}

// Which tab of the client portal a proposal shows under.
export type ProposalStatus = 'active' | 'completed' | 'declined';

export interface ProposalFile {
  id: string;
  name: string;
  type: string;
  size: string;
  uploaded: string;
  // True when the signed-in client uploaded it (only their own are deletable)
  uploadedByClient: boolean;
}

// One entry in a proposal's message thread between the client and the team.
export interface ProposalMessage {
  id: string;
  from: 'team' | 'client';
  text: string;
  sent: string;
}

export interface Proposal {
  id: string;
  title: string;
  status: ProposalStatus;
  // True until the team picks the request up (shown as "Under Review");
  // approving it on the team dashboard flips it to In Progress
  underReview: boolean;
  lastUpdated: string;
  budget: string;
  timeline: string;
  projectType: string;
  details: string;
  files: ProposalFile[];
  messages: ProposalMessage[];
}

export interface ClientProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
}

// --- Team proposal manager ---

// Status vocabulary the manager works in (the backend maps these onto the
// internal pipeline states).
export type ManagerStatus = 'new' | 'in_progress' | 'accepted' | 'declined';

// One row of the manager's proposals table.
export interface TeamProposalRow {
  id: string;
  title: string;
  clientName: string;
  status: ManagerStatus;
  created: string;
  // ISO timestamp for sorting; `created` is for display
  createdSort: string;
}

// An internal team note on a submission (never shown to clients).
export interface TeamNote {
  id: string;
  sender: string;
  text: string;
  posted: string;
}

// A status the team defined on the Settings page (stored; not yet
// assignable to proposals).
export interface CustomStatus {
  name: string;
  color: string;
}

// Team-configurable settings, as stored by the backend.
export interface TeamSettings {
  status_colors: Record<string, string>;
  custom_statuses: CustomStatus[];
  categories: string[];
  file_types: string[];
  budget_ranges: string[];
}

// Pill colors the client portal shares with the team dashboard, keyed by
// the portal's status vocabulary.
export type PortalStatusColors = Record<'new' | 'active' | 'completed' | 'declined', string>;

// --- Clients page ---

// One proposal in a client's expanded list.
export interface TeamClientProposal {
  id: string;
  title: string;
  status: ManagerStatus;
  budget: string;
  // Dollar value: the priced proposal when the team has set one, otherwise
  // an estimate parsed from the budget range
  value: number;
  timelineWeeks: number;
  created: string;
  createdSort: string;
}

// A client (or unregistered lead) with their proposals rolled up.
export interface TeamClientSummary {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  // True when they've registered for the portal (vs. an intake-only lead)
  hasAccount: boolean;
  proposalCount: number;
  counts: Record<ManagerStatus, number>;
  totalValue: number;
  wonValue: number;
  avgTimelineWeeks: number;
  firstCreated: string;
  lastCreated: string;
  lastCreatedSort: string;
  proposals: TeamClientProposal[];
}

// Everything the manager's View popup shows across its tabs.
export interface TeamProposalDetail extends TeamProposalRow {
  client: {
    name: string;
    email: string;
    phone: string;
    company: string;
  };
  budget: string;
  timelineWeeks: number;
  projectType: string;
  details: string;
  updated: string;
  notes: TeamNote[];
  files: ProposalFile[];
  messages: ProposalMessage[];
}
