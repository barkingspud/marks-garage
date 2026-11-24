import { describe, expect, it } from 'vitest';
import { parseSellerInput } from './sellers';

describe('parseSellerInput', () => {
  it('understands seller names', () => {
    expect(parseSellerInput('  groovevault-records ')).toEqual({ kind: 'username', username: 'groovevault-records' });
    expect(parseSellerInput('Dusty.Groove_2')).toEqual({ kind: 'username', username: 'Dusty.Groove_2' });
    expect(parseSellerInput('two words')).toBeNull();
    expect(parseSellerInput('')).toBeNull();
  });

  it('understands seller, profile and listing links, with or without a language', () => {
    expect(parseSellerInput('https://www.discogs.com/seller/groovevault-records/profile')).toEqual({ kind: 'username', username: 'groovevault-records' });
    expect(parseSellerInput('https://www.discogs.com/user/spincycle-usa')).toEqual({ kind: 'username', username: 'spincycle-usa' });
    expect(parseSellerInput('https://www.discogs.com/sell/item/3109412345')).toEqual({ kind: 'listing', listingId: 3109412345 });
    expect(parseSellerInput('https://www.discogs.com/fr/sell/item/42?ev=rb')).toEqual({ kind: 'listing', listingId: 42 });
    expect(parseSellerInput('https://www.discogs.com/de/seller/northern-wax/profile')).toEqual({ kind: 'username', username: 'northern-wax' });
  });

  it('finds the link inside shared text', () => {
    expect(parseSellerInput('Check out this record on Discogs: https://www.discogs.com/sell/item/777 via the Discogs app'))
      .toEqual({ kind: 'listing', listingId: 777 });
  });

  it('ignores Discogs links that name no shop', () => {
    expect(parseSellerInput('https://www.discogs.com/release/1869293-Dobie-Gray-Drift-Away')).toBeNull();
    expect(parseSellerInput('https://example.com/seller/someone')).toBeNull();
  });
});
