import React, { useId } from 'react';
import { Search, X } from 'lucide-react';

interface ToolbarProps {
  children: React.ReactNode;
}

/**
 * Filter row shared by every list screen. Wraps onto multiple lines on
 * narrow viewports so the controls never overflow horizontally.
 */
export const Toolbar: React.FC<ToolbarProps> = ({ children }) => (
  <div className="toolbar">{children}</div>
);

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Visible-to-screen-readers label; the control itself stays compact. */
  label: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search…',
  label
}) => {
  const id = useId();

  return (
    <div className="toolbar__search">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search size={15} className="toolbar__search-icon" aria-hidden="true" />
      <input
        id={id}
        type="search"
        className="form-input toolbar__search-input"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="toolbar__search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: Array<{ value: string; label: string }>;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({ value, onChange, label, options }) => {
  const id = useId();

  return (
    <div className="toolbar__filter">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};
