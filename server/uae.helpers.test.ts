import { describe, it, expect } from 'vitest';
import {
  normalizeEmirate,
  normalizeCity,
  normalizeDisplayName,
  normalizePhone,
  nationalDigits,
  isPlausiblePhone,
  isUaeMobile,
  splitPhone,
  isPinNearEmirate,
} from '@shared/uae';
import { getZoneFromEmirate } from './db';

describe('normalizeEmirate', () => {
  it('maps the legacy admin short codes to canonical names', () => {
    expect(normalizeEmirate('RAK')).toBe('Ras Al Khaimah');
    expect(normalizeEmirate('UAQ')).toBe('Umm Al Quwain');
  });

  it('maps the transliterations Google returns', () => {
    expect(normalizeEmirate('Raʾs al-Khaymah')).toBe('Ras Al Khaimah');
    expect(normalizeEmirate('Abū Ẓaby')).toBe('Abu Dhabi');
    expect(normalizeEmirate('Ash Shāriqah')).toBe('Sharjah');
    expect(normalizeEmirate("'Ajmān")).toBe('Ajman');
    expect(normalizeEmirate('Al Fujayrah')).toBe('Fujairah');
  });

  it('handles decorated forms', () => {
    expect(normalizeEmirate('Emirate of Sharjah')).toBe('Sharjah');
    expect(normalizeEmirate('Dubai - United Arab Emirates')).toBe('Dubai');
  });

  it('bills Al Ain under Abu Dhabi', () => {
    expect(normalizeEmirate('Al Ain')).toBe('Abu Dhabi');
  });

  it('returns undefined for anything unrecognisable', () => {
    expect(normalizeEmirate('')).toBeUndefined();
    expect(normalizeEmirate(null)).toBeUndefined();
    expect(normalizeEmirate('Riyadh')).toBeUndefined();
  });

  it('produces values the rate zone mapper agrees with', () => {
    expect(getZoneFromEmirate(normalizeEmirate('RAK')!)).toBe(2);
    expect(getZoneFromEmirate(normalizeEmirate('UAQ')!)).toBe(2);
    expect(getZoneFromEmirate(normalizeEmirate('Al Ain')!)).toBe(1);
    expect(getZoneFromEmirate(normalizeEmirate('Dubai')!)).toBe(1);
  });
});

describe('normalizeCity', () => {
  it('keeps Al Ain as its own city', () => {
    expect(normalizeCity('al ain')).toBe('Al Ain');
  });

  it('canonicalises casing and separators', () => {
    expect(normalizeCity('ras al-khaimah')).toBe('Ras Al Khaimah');
  });

  it('merges spellings that lost their spaces', () => {
    // Real rows from the orders table — these used to rank as separate cities in
    // the analytics "Distribution by City" chart.
    expect(normalizeCity('Abudhabi')).toBe('Abu Dhabi');
    expect(normalizeCity('ABUDHABI')).toBe('Abu Dhabi');
    expect(normalizeCity('rasalkhaimah')).toBe('Ras Al Khaimah');
    expect(normalizeCity('ummalquwain')).toBe('Umm Al Quwain');
  });

  it('returns undefined for areas we do not know', () => {
    expect(normalizeCity('Kalba')).toBeUndefined();
  });
});

describe('normalizeDisplayName', () => {
  it('canonicalises known UAE cities', () => {
    expect(normalizeDisplayName('abudhabi')).toBe('Abu Dhabi');
    expect(normalizeDisplayName('ras al-khaimah')).toBe('Ras Al Khaimah');
  });

  it('title-cases fully lower- or upper-case international cities', () => {
    expect(normalizeDisplayName('santa clara')).toBe('Santa Clara');
    expect(normalizeDisplayName('NEW YORK')).toBe('New York');
  });

  it('preserves intentional mixed casing and punctuation', () => {
    expect(normalizeDisplayName('eThekwini')).toBe('eThekwini');
    expect(normalizeDisplayName('rio-de-janeiro')).toBe('Rio-De-Janeiro');
  });
});

describe('normalizePhone', () => {
  it('strips the local trunk zero', () => {
    expect(normalizePhone('+971', '0551234567')).toBe('+971 551234567');
  });

  it('strips a duplicated country code', () => {
    expect(normalizePhone('+971', '971551234567')).toBe('+971 551234567');
    expect(normalizePhone('+971', '+971 55 123 4567')).toBe('+971 551234567');
  });

  it('drops formatting characters', () => {
    expect(normalizePhone('+971', '55-123 4567')).toBe('+971 551234567');
    expect(normalizePhone('+971', '(055) 123 4567')).toBe('+971 551234567');
  });

  it('does not mistake a short national number for a country code', () => {
    // 971... is not stripped when what remains would be too short to be a number
    expect(normalizePhone('+971', '9712345')).toBe('+971 9712345');
  });

  it('returns empty for empty input', () => {
    expect(normalizePhone('+971', '')).toBe('');
    expect(normalizePhone('+971', '   ')).toBe('');
  });
});

describe('isPlausiblePhone', () => {
  it('accepts UAE mobiles and landlines', () => {
    expect(isPlausiblePhone('+971', '0551234567')).toBe(true);
    expect(isPlausiblePhone('+971', '551234567')).toBe(true);
    expect(isPlausiblePhone('+971', '42345678')).toBe(true);
  });

  it('rejects wrong-length UAE numbers', () => {
    expect(isPlausiblePhone('+971', '55123')).toBe(false);
    expect(isPlausiblePhone('+971', '5512345678901')).toBe(false);
    expect(isPlausiblePhone('+971', '')).toBe(false);
  });

  it('checks length for the other GCC prefixes', () => {
    expect(isPlausiblePhone('+966', '512345678')).toBe(true);
    expect(isPlausiblePhone('+965', '12345678')).toBe(true);
    expect(isPlausiblePhone('+965', '123')).toBe(false);
  });
});

describe('isUaeMobile', () => {
  it('only accepts +971 5xxxxxxxx', () => {
    expect(isUaeMobile('+971', '0551234567')).toBe(true);
    expect(isUaeMobile('+971', '42345678')).toBe(false);
    expect(isUaeMobile('+966', '551234567')).toBe(false);
  });
});

describe('splitPhone', () => {
  it('round-trips a stored number', () => {
    expect(splitPhone('+971 551234567')).toEqual({ prefix: '+971', national: '551234567' });
    expect(splitPhone('+966 512345678')).toEqual({ prefix: '+966', national: '512345678' });
  });

  it('defaults to +971 for bare numbers', () => {
    expect(splitPhone('0551234567')).toEqual({ prefix: '+971', national: '551234567' });
    expect(splitPhone('')).toEqual({ prefix: '+971', national: '' });
    expect(splitPhone(null)).toEqual({ prefix: '+971', national: '' });
  });

  it('survives the legacy "+971 0551234567" rows', () => {
    expect(splitPhone('+971 0551234567')).toEqual({ prefix: '+971', national: '551234567' });
  });
});

describe('isPinNearEmirate', () => {
  it('accepts a Dubai pin for Dubai', () => {
    expect(isPinNearEmirate({ lat: 25.2048, lng: 55.2708 }, 'Dubai')).toBe(true);
  });

  it('flags a Dubai pin filed under Fujairah', () => {
    expect(isPinNearEmirate({ lat: 25.2048, lng: 55.2708 }, 'Fujairah')).toBe(false);
  });

  it('accepts an Al Ain pin under Abu Dhabi', () => {
    expect(isPinNearEmirate({ lat: 24.2075, lng: 55.7447 }, 'Abu Dhabi')).toBe(true);
  });

  it('never warns when the emirate is unknown', () => {
    expect(isPinNearEmirate({ lat: 0, lng: 0 }, 'Nowhere')).toBe(true);
    expect(isPinNearEmirate({ lat: 0, lng: 0 }, null)).toBe(true);
  });
});
