import { secondsToBillableMinutes } from './usage-pricing';

describe('usage pricing', () => {
  it('rounds voice seconds up to billable minutes', () => {
    expect(secondsToBillableMinutes(1)).toBe(1);
    expect(secondsToBillableMinutes(60)).toBe(1);
    expect(secondsToBillableMinutes(61)).toBe(2);
  });
});
