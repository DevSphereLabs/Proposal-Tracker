// Single client for the Flask backend. Every network call the app makes goes
// through here. Requests hit /api/* on this origin and Next.js rewrites them to
// the backend (see next.config.ts), so there's no cross-origin handling here.
import type {
  ClientProfile,
  ManagerStatus,
  PortalStatusColors,
  Proposal,
  ProposalDetails,
  ProposalFile,
  ProposalMessage,
  TeamNote,
  TeamProposalDetail,
  TeamProposalRow,
  TeamSettings,
} from '@/types';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// The signed-in user, cached from login so the nav can show initials without
// an extra request. `role` decides which dashboard they land on: CLIENT gets
// the portal, MEMBER/ADMIN get the team's proposal manager.
export interface SessionUser {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

// Thrown for any non-2xx response. `status` lets callers branch on 401/403/409.
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// --- Session storage (browser only) ---

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

// The session is an external store components can subscribe to (via
// useSyncExternalStore) so the nav updates immediately on sign-in/out.
const sessionListeners = new Set<() => void>();

export function subscribeSession(onChange: () => void): () => void {
  sessionListeners.add(onChange);
  return () => sessionListeners.delete(onChange);
}

// Raw stored user JSON (or null). Stable by value, so it's a safe snapshot.
export function getSessionSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USER_KEY);
}

function notifySession() {
  sessionListeners.forEach((onChange) => onChange());
}

function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifySession();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifySession();
}

// Keep the cached user in sync when the profile changes, so the nav's
// initials update without a re-login.
function patchSessionUser(changes: Partial<SessionUser>) {
  const current = getSessionUser();
  if (!current) return;
  localStorage.setItem(USER_KEY, JSON.stringify({ ...current, ...changes }));
  notifySession();
}

// --- Core request helper ---

async function toApiError(res: Response): Promise<ApiError> {
  let message = res.statusText;
  let code: string | undefined;
  try {
    const data = await res.json();
    if (typeof data.error === 'string') message = data.error;
    else if (typeof data.message === 'string') message = data.message;
    else {
      // marshmallow validation errors come back as { field: [messages] }
      const flat = Object.values(data).flat().filter(Boolean);
      if (flat.length) message = flat.join(', ');
    }
    if (typeof data.code === 'string') code = data.code;
  } catch {
    // Non-JSON body: keep the status text
  }
  return new ApiError(message, res.status, code);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  isForm?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, isForm = false } = options;

  const headers: Record<string, string> = {};
  if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: isForm ? (body as BodyInit) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// --- Auth ---

export async function login(email: string, password: string): Promise<SessionUser> {
  const data = await request<{ token: string; user: Record<string, string> }>(
    '/users/login',
    { method: 'POST', body: { email, password } }
  );
  const user: SessionUser = {
    email: data.user.email,
    firstName: data.user.first_name ?? '',
    lastName: data.user.last_name ?? '',
    role: data.user.role ?? 'CLIENT',
  };
  setSession(data.token, user);
  return user;
}

interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company_name: string;
}

async function register(payload: RegisterPayload): Promise<void> {
  await request('/users/register', { method: 'POST', body: payload });
}

// Values the intake selects use, mapped to what the backend stores.
const PROJECT_TYPE_LABELS: Record<string, string> = {
  web: 'Web Development',
  mobile: 'Mobile App',
  fullstack: 'Full Stack Web App',
  other: 'Other',
};

const BUDGET_LABELS: Record<string, string> = {
  'under-5k': 'Under $5k',
  '5k-15k': '$5k - $15k',
  '15k-50k': '$15k - $50k',
  '50k-plus': '$50k+',
  'not-sure': 'Not sure yet',
};

const TIMELINE_WEEKS: Record<string, number> = {
  asap: 2,
  '1-3-months': 8,
  '3-6-months': 20,
  flexible: 12,
};

// Submit a proposal anonymously — no account required. This is the primary
// action of the public intake form.
export async function submitProposal(details: ProposalDetails): Promise<void> {
  await request('/submissions', {
    method: 'POST',
    body: {
      contact_name: `${details.firstName} ${details.lastName}`.trim(),
      contact_email: details.email,
      project_type: PROJECT_TYPE_LABELS[details.projectType] ?? 'Other',
      budget_range: BUDGET_LABELS[details.budget] ?? 'Not specified',
      timeline_weeks: TIMELINE_WEEKS[details.timeline] ?? 8,
      description: details.projectDetails,
    },
  });
}

// Optional step after submitting: create an account (or reuse an existing one
// for the same email) and sign in. The backend ties the just-submitted
// proposal to the account by matching email, so it shows up on the portal.
export async function registerAndSignIn(details: ProposalDetails, password: string): Promise<void> {
  try {
    await register({
      email: details.email,
      password,
      first_name: details.firstName,
      last_name: details.lastName,
      company_name: details.companyName,
    });
  } catch (err) {
    // Already registered (repeat testing with the same email): fall through to
    // login. The proposal was already claimed at submit time by email match.
    if (!(err instanceof ApiError && err.status === 409)) throw err;
  }

  await login(details.email, password);
}

// --- Portal ---

export function getMe(): Promise<ClientProfile> {
  return request<{ client: ClientProfile }>('/portal/me', { auth: true }).then((d) => d.client);
}

// Editable "My Details" fields. Email stays fixed: it's the login identity
// and what links submissions to the account.
export interface ProfileUpdate {
  first_name: string;
  last_name: string;
  phone: string;
  company_name: string;
}

export function updateMe(changes: ProfileUpdate): Promise<ClientProfile> {
  return request<{ client: ClientProfile }>(
    '/portal/me',
    { method: 'PATCH', body: changes, auth: true }
  ).then((d) => {
    patchSessionUser({ firstName: d.client.firstName, lastName: d.client.lastName });
    return d.client;
  });
}

export function getProposals(): Promise<Proposal[]> {
  return request<{ proposals: Proposal[] }>('/portal/proposals', { auth: true }).then((d) => d.proposals);
}

// Editable proposal fields; the backend only accepts these while the
// proposal is still active.
export interface ProposalUpdate {
  budget_range: string;
  timeline_weeks: number;
  project_type: string;
  description: string;
}

export function updateProposal(submissionId: string, changes: ProposalUpdate): Promise<Proposal> {
  return request<{ proposal: Proposal }>(
    `/portal/proposals/${submissionId}`,
    { method: 'PATCH', body: changes, auth: true }
  ).then((d) => d.proposal);
}

export function sendMessage(submissionId: string, body: string): Promise<ProposalMessage> {
  return request<{ message: ProposalMessage }>(
    `/portal/proposals/${submissionId}/messages`,
    { method: 'POST', body: { body }, auth: true }
  ).then((d) => d.message);
}

export function deleteMessage(messageId: string): Promise<void> {
  return request(`/portal/messages/${messageId}`, { method: 'DELETE', auth: true });
}

export function uploadFiles(submissionId: string, files: File[]): Promise<ProposalFile[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return request<{ files: ProposalFile[] }>(
    `/portal/proposals/${submissionId}/files`,
    { method: 'POST', body: form, auth: true, isForm: true }
  ).then((d) => d.files);
}

export function deleteFile(fileId: string): Promise<void> {
  return request(`/portal/files/${fileId}`, { method: 'DELETE', auth: true });
}

// Files need the Authorization header, so fetch the blob and trigger a
// download rather than pointing an <a> at the URL.
async function downloadBlob(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await toApiError(res);

  const url = URL.createObjectURL(await res.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadFile(fileId: string, filename: string): Promise<void> {
  return downloadBlob(`/portal/files/${fileId}/download`, filename);
}

// --- Team proposal manager ---

export function getTeamProposals(): Promise<TeamProposalRow[]> {
  return request<{ proposals: TeamProposalRow[] }>('/team/proposals', { auth: true })
    .then((d) => d.proposals);
}

export function getTeamProposal(submissionId: string): Promise<TeamProposalDetail> {
  return request<{ proposal: TeamProposalDetail }>(`/team/proposals/${submissionId}`, { auth: true })
    .then((d) => d.proposal);
}

// Same editable fields as the portal, plus the pipeline status
export interface TeamProposalUpdate {
  budget_range?: string;
  timeline_weeks?: number;
  project_type?: string;
  description?: string;
  status?: ManagerStatus;
}

export function updateTeamProposal(
  submissionId: string,
  changes: TeamProposalUpdate
): Promise<TeamProposalDetail> {
  return request<{ proposal: TeamProposalDetail }>(
    `/team/proposals/${submissionId}`,
    { method: 'PATCH', body: changes, auth: true }
  ).then((d) => d.proposal);
}

export function deleteTeamProposal(submissionId: string): Promise<void> {
  return request(`/team/proposals/${submissionId}`, { method: 'DELETE', auth: true });
}

export function addTeamNote(submissionId: string, text: string): Promise<TeamNote> {
  return request<{ note: TeamNote }>(
    `/team/proposals/${submissionId}/notes`,
    { method: 'POST', body: { text }, auth: true }
  ).then((d) => d.note);
}

export function deleteTeamNote(noteId: string): Promise<void> {
  return request(`/team/notes/${noteId}`, { method: 'DELETE', auth: true });
}

export function sendTeamMessage(submissionId: string, body: string): Promise<ProposalMessage> {
  return request<{ message: ProposalMessage }>(
    `/team/proposals/${submissionId}/messages`,
    { method: 'POST', body: { body }, auth: true }
  ).then((d) => d.message);
}

export function deleteTeamMessage(messageId: string): Promise<void> {
  return request(`/team/messages/${messageId}`, { method: 'DELETE', auth: true });
}

export function uploadTeamFiles(submissionId: string, files: File[]): Promise<ProposalFile[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  return request<{ files: ProposalFile[] }>(
    `/team/proposals/${submissionId}/files`,
    { method: 'POST', body: form, auth: true, isForm: true }
  ).then((d) => d.files);
}

export function deleteTeamFile(fileId: string): Promise<void> {
  return request(`/team/files/${fileId}`, { method: 'DELETE', auth: true });
}

export function downloadTeamFile(fileId: string, filename: string): Promise<void> {
  return downloadBlob(`/team/files/${fileId}/download`, filename);
}

// --- Settings ---

// Pill colors for the client portal, derived from the team's status colors
export function getPortalDisplaySettings(): Promise<PortalStatusColors> {
  return request<{ statusColors: PortalStatusColors }>('/portal/settings', { auth: true })
    .then((d) => d.statusColors);
}

export interface TeamSettingsPayload {
  settings: TeamSettings;
  // The full safe list File Types may toggle within (not persisted)
  available_file_types: string[];
}

export function getTeamSettings(): Promise<TeamSettingsPayload> {
  return request<TeamSettingsPayload>('/team/settings', { auth: true });
}

export function updateTeamSettings(changes: Partial<TeamSettings>): Promise<TeamSettingsPayload> {
  return request<TeamSettingsPayload>('/team/settings', { method: 'PUT', body: changes, auth: true });
}

export function getTeamProfile(): Promise<ClientProfile> {
  return request<{ profile: ClientProfile }>('/team/profile', { auth: true }).then((d) => d.profile);
}

// Profile fields plus an optional password change (requires the current one)
export interface TeamProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string;
  current_password?: string;
  new_password?: string;
}

export function updateTeamProfile(changes: TeamProfileUpdate): Promise<ClientProfile> {
  return request<{ profile: ClientProfile }>(
    '/team/profile',
    { method: 'PATCH', body: changes, auth: true }
  ).then((d) => {
    patchSessionUser({ firstName: d.profile.firstName, lastName: d.profile.lastName });
    return d.profile;
  });
}
