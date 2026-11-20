import { useState } from 'react';

import { useCreateHsnCodeMutation, useHsnCodesQuery } from '@/queries/useCatalogQueries';
import { ApiClientError } from '@/services';
import styles from '@/styles/shared.module.css';
import type { HsnCodeOption } from '@/types/catalog.types';

const HSN_PATTERN = /^\d{4,8}$/;

// Search HSN codes by code prefix or description and pick one; its GST rate
// comes with it (decision 0063). An "Add HSN code" row adds a missing code
// (the client's accountant supplies them) and selects it.
export function HsnPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (code: string | null, gstRate: number | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: '', description: '', gstRate: '' });
  const [error, setError] = useState<string | null>(null);
  const codesQuery = useHsnCodesQuery(search);
  const selectedQuery = useHsnCodesQuery(value ?? '');
  const createCode = useCreateHsnCodeMutation();
  const selected = (selectedQuery.data ?? []).find((option) => option.code === value);

  const pick = (option: HsnCodeOption) => onChange(option.code, option.gstRate);

  const add = async () => {
    setError(null);
    const rate = Number(draft.gstRate);
    if (!HSN_PATTERN.test(draft.code.trim())) return setError('HSN code must be 4 to 8 digits');
    if (!draft.description.trim()) return setError('Description is required');
    if (draft.gstRate === '' || Number.isNaN(rate) || rate < 0 || rate > 100) {
      return setError('GST rate must be between 0 and 100');
    }
    try {
      const created = await createCode.mutateAsync({
        code: draft.code.trim(),
        description: draft.description.trim(),
        gstRate: rate,
      });
      pick(created);
      setAdding(false);
      setDraft({ code: '', description: '', gstRate: '' });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Could not add the HSN code');
    }
  };

  return (
    <div>
      <p className={styles.hint}>
        {value
          ? `HSN code: ${value}${selected ? ` (${selected.description})` : ''}`
          : 'No HSN code (allowed for now; shown as a warning)'}
      </p>
      <input
        className={`${styles.input} ${styles.pickerInput}`}
        aria-label="Find an HSN code"
        placeholder="Code or description"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <ul role="listbox" aria-label="HSN codes" className={styles.pickerList}>
        {(codesQuery.data ?? []).map((option) => (
          <li
            key={option.code}
            role="option"
            aria-selected={option.code === value}
            className={`${styles.pickerOption} ${option.code === value ? styles.pickerOptionActive : ''}`}
            onClick={() => pick(option)}
          >
            {`${option.code} · ${option.description} · ${option.gstRate}%`}
          </li>
        ))}
      </ul>
      <div className={styles.inlineForm}>
        {value ? (
          <button
            type="button"
            className={`${styles.button} ${styles.buttonGhost}`}
            onClick={() => onChange(null, null)}
          >
            No HSN code
          </button>
        ) : null}
        <button
          type="button"
          className={`${styles.button} ${styles.buttonGhost}`}
          onClick={() => setAdding((current) => !current)}
        >
          Add HSN code
        </button>
      </div>
      {adding ? (
        <div className={styles.inlineForm}>
          <input
            className={styles.input}
            aria-label="New HSN code"
            placeholder="e.g. 69072100"
            value={draft.code}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          />
          <input
            className={styles.input}
            aria-label="New HSN description"
            placeholder="Description"
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
          <input
            className={styles.input}
            aria-label="New HSN GST rate (%)"
            type="number"
            placeholder="GST %"
            value={draft.gstRate}
            onChange={(event) => setDraft({ ...draft, gstRate: event.target.value })}
          />
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={createCode.isPending}
            onClick={add}
          >
            Save HSN code
          </button>
        </div>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
