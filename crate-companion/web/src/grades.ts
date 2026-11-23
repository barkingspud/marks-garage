import type { CollectionField, CollectionItem } from '../../shared/discogs-types';
import { parseGrade } from '../../shared/conditions';

/** Your record and sleeve grades, from the collection's custom fields ("Media Condition" etc). */
export function myGrades(item: CollectionItem | undefined, fields: CollectionField[] | undefined) {
  const find = (re: RegExp) => {
    const f = fields?.find((x) => re.test(x.name));
    const v = f && item?.notes?.find((n) => n.field_id === f.id)?.value;
    return v ? { text: v.replace(/\s*\([^)]*\)\s*$/, ''), grade: parseGrade(v) } : null;
  };
  return { media: find(/media|record|vinyl/i), sleeve: find(/sleeve|cover|jacket/i) };
}
