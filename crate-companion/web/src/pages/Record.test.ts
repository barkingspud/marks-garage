import { describe, expect, it } from 'vitest';
import { previewIds } from './Record';

describe('previewIds', () => {
  it('shows one barcode and the first runouts', () => {
    const ids = [
      { type: 'Barcode', value: '0 7599-25264-1', description: 'Text' },
      { type: 'Barcode', value: '075992526418', description: 'Scanned' },
      { type: 'Rights Society', value: 'ASCAP' },
      { type: 'Pressing Plant ID', value: 'E A S T' },
      { type: 'Matrix / Runout', value: '1-25264-A', description: 'Side A' },
      { type: 'Matrix / Runout', value: '1-25264-B', description: 'Side B' },
      { type: 'Matrix / Runout', value: '1-25264-A-2', description: 'Side A, variant 2' },
    ];
    expect(previewIds(ids).map((x) => x.value)).toEqual(['0 7599-25264-1', '1-25264-A', '1-25264-B']);
  });
  it('fills up with other codes when there are no runouts, and leaves short lists alone', () => {
    const ids = [{ type: 'Rights Society', value: 'BIEM' }, { type: 'Barcode', value: '123' }, { type: 'Label Code', value: 'LC 0485' }, { type: 'Price Code', value: 'S' }];
    expect(previewIds(ids).map((x) => x.value)).toEqual(['BIEM', '123', 'LC 0485']);
    expect(previewIds(ids.slice(0, 2))).toHaveLength(2);
  });
});
