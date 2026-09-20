import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Plural noun for the summary line, e.g. "questions", "candidates". */
  itemLabel?: string;
}

/**
 * Page control for the admin list screens. Renders nothing when everything
 * already fits on one page, so short lists stay visually uncluttered.
 */
export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = 'records'
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems <= pageSize) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination__summary">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{totalItems}</strong> {itemLabel}
      </span>

      <div className="pagination__controls">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft size={14} aria-hidden="true" /> Previous
        </button>

        <span className="pagination__position" aria-current="page">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};

/** Clamps a page number when the underlying list shrinks (e.g. after filtering). */
export const clampPage = (page: number, pageSize: number, totalItems: number): number => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(1, page), totalPages);
};
