import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { forgetJobResults } from '../useJob';

/** Forget the connected Discogs account and go back to the connect page. */
export function DisconnectButton() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: api.disconnect,
    onSuccess: () => {
      // Everything on screen belongs to the old account. Clearing the cache also drops the
      // query that says who's signed in, so nothing would redraw: start the app over instead.
      qc.clear();
      forgetJobResults();
      window.location.replace('/');
    },
  });
  return (
    <button
      className="btn small"
      disabled={m.isPending}
      onClick={() => {
        if (confirm('Disconnect your Discogs account from Crate Companion?')) m.mutate();
      }}
    >
      {m.isPending ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
