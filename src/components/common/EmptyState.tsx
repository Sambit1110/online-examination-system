import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call to action, e.g. a "Create your first question" button. */
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="state-panel">
    <div className="state-panel__icon" aria-hidden="true">
      {icon || <Inbox size={26} strokeWidth={1.5} />}
    </div>
    <div className="state-panel__title">{title}</div>
    {description && <p className="state-panel__desc">{description}</p>}
    {action}
  </div>
);
