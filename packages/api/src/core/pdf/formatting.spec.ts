import { amountInWords, formatLongDate, formatNumberWithCommas } from './formatting';

describe('amount-in-words (Invoify parity)', () => {
  it('matches the sample invoice wording for USD', () => {
    expect(amountInWords(10568, 'USD')).toBe('Ten thousand, five hundred sixty-eight Dollar');
    expect(amountInWords(5267.74, 'USD')).toBe(
      'Five thousand, two hundred sixty-seven Dollar and seventy-four Cents',
    );
  });

  it('renders PKR with rupee/paisa naming', () => {
    expect(amountInWords(125000.5, 'PKR')).toBe(
      'One hundred twenty-five thousand Rupee and fifty Paisa',
    );
  });

  it('handles zero and unknown currencies gracefully', () => {
    expect(amountInWords(0, 'USD')).toBe('Zero');
    expect(amountInWords(12.5, 'XYZ')).toBe('Twelve point five');
  });
});

describe('document formatting', () => {
  it('formats long dates like the templates', () => {
    expect(formatLongDate('2026-08-20')).toBe('August 20, 2026');
  });

  it('formats money with exactly two decimals and thousands separators', () => {
    expect(formatNumberWithCommas(1542.86)).toBe('1,542.86');
    expect(formatNumberWithCommas(1000000)).toBe('1,000,000.00');
  });
});
