import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

/** Forget the connected Discogs account and go back to the connect page. */
export function DisconnectButton() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: api.disconnect,
    onSuccess: () => {
      qc.clear(); // cached data belongs to the old account
      void qc.invalidateQueries({ queryKey: ['status'] });
    },
  });
  return (
    <button
      className="small ghost"
      disabled={m.isPending}
      onClick={() => {
        if (confirm('Disconnect your Discogs account from Crate Companion?')) m.mutate();
      }}
    >
      {m.isPending ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
