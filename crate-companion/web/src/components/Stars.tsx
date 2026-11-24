import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CollectionItem } from '../../../shared/discogs-types';
import { api } from '../api';

const STAR = 'M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6-4.5-4.2 6.1-.8z';

/** Your 1–5 star rating. Tap a star to rate; tap the same star again to clear it. */
export function Stars({ value, onChange, disabled, label = 'Your rating' }: {
  value: number; onChange?: (n: number) => void; disabled?: boolean; label?: string;
}) {
  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={value ? `${label}: ${value} of 5 stars` : `${label}: not rated`}>
        {[1, 2, 3, 4, 5].map((n) => <svg key={n} viewBox="0 0 24 24" aria-hidden className={n <= value ? 'on' : ''}><path d={STAR} /></svg>)}
      </span>
    );
  }
  return (
    <span className="stars stars-input" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} aria-pressed={n === value}
          aria-label={n === value ? `${n} star${n === 1 ? '' : 's'}, tap to clear` : `Rate ${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n === value ? 0 : n)}>
          <svg viewBox="0 0 24 24" aria-hidden className={n <= value ? 'on' : ''}><path d={STAR} /></svg>
        </button>
      ))}
    </span>
  );
}

type CollectionData = { items: CollectionItem[] };

/** Save a rating to Discogs. The stars change right away and go back if saving fails. */
export function useRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: CollectionItem & { newRating: number }) =>
      api.rate({ releaseId: item.id, instanceId: item.instance_id, folderId: item.folder_id, rating: item.newRating }),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: ['collection'] });
      const before = qc.getQueriesData<CollectionData>({ queryKey: ['collection'] });
      qc.setQueriesData<CollectionData>({ queryKey: ['collection'] }, (d) => d && {
        items: d.items.map((i) => (i.instance_id === item.instance_id ? { ...i, rating: item.newRating } : i)),
      });
      return { before };
    },
    onError: (_e, _item, ctx) => ctx?.before.forEach(([k, d]) => qc.setQueryData(k, d)),
  });
}

/** The rating control for one record you own, saving as you tap. */
export function RateRecord({ item }: { item: CollectionItem }) {
  const rate = useRate();
  return (
    <div className="rate-record">
      <Stars value={item.rating} onChange={(n) => rate.mutate({ ...item, newRating: n })} />
      {rate.isError && <span className="bad small" role="alert">Couldn't save the rating. {(rate.error as Error).message}</span>}
    </div>
  );
}
