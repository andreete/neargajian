import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, ClockIcon, EditIcon, SendIcon, XIcon } from './icons';

export type RunStatus =
  | 'draft' | 'submitting' | 'submit_failed' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
  | 'awaiting_funding' | 'releasing' | 'needs_attention' | 'paid' | 'partially_paid';

const STATUS: Record<RunStatus, { label: string; tone: string; icon: ReactNode }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: <EditIcon size={13} /> },
  submitting: { label: 'Submitting', tone: 'info', icon: <SendIcon size={13} /> },
  submit_failed: { label: 'Submit failed', tone: 'danger', icon: <AlertIcon size={13} /> },
  pending_approval: { label: 'Awaiting approval', tone: 'waiting', icon: <ClockIcon size={13} /> },
  approved: { label: 'Ready to release', tone: 'info', icon: <CheckIcon size={13} /> },
  rejected: { label: 'Rejected', tone: 'danger', icon: <XIcon size={13} /> },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <XIcon size={13} /> },
  awaiting_funding: { label: 'Awaiting funding', tone: 'waiting', icon: <ClockIcon size={13} /> },
  releasing: { label: 'Releasing', tone: 'info', icon: <SendIcon size={13} /> },
  needs_attention: { label: 'Needs attention', tone: 'danger', icon: <AlertIcon size={13} /> },
  paid: { label: 'Paid', tone: 'success', icon: <CheckIcon size={13} /> },
  partially_paid: { label: 'Partially paid', tone: 'waiting', icon: <AlertIcon size={13} /> },
};

export function StatusChip({ status }: { status: RunStatus }) {
  const s = STATUS[status];
  return <span className={`chip chip-${s.tone}`}>{s.icon}{s.label}</span>;
}

export function Chip({ tone, icon, children }: { tone: 'neutral' | 'info' | 'waiting' | 'danger' | 'success' | 'testnet'; icon?: ReactNode; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{icon}{children}</span>;
}
