import numberToWords from 'number-to-words';

// Ported from Invoify's formatPriceToString so generated documents read exactly
// like the ones finance produces today ("Ten thousand, five hundred sixty-eight
// Dollar and Seventy-four Cents"). The full currencies.json is reduced to the
// codes this product actually bills in; unknown codes fall back to dynamic
// decimals without currency names.

type CurrencyWords = {
  readonly decimals: number;
  readonly beforeDecimal: string | null;
  readonly afterDecimal: string | null;
};

const CURRENCY_WORDS: Record<string, CurrencyWords> = {
  USD: { decimals: 2, beforeDecimal: 'Dollar', afterDecimal: 'Cents' },
  PKR: { decimals: 2, beforeDecimal: 'Rupee', afterDecimal: 'Paisa' },
  EUR: { decimals: 2, beforeDecimal: 'Euro', afterDecimal: 'Cent' },
  GBP: { decimals: 2, beforeDecimal: 'Pound', afterDecimal: 'Penny' },
  AED: { decimals: 2, beforeDecimal: 'Dirham', afterDecimal: 'Fils' },
  INR: { decimals: 2, beforeDecimal: 'Rupee', afterDecimal: 'Paisa' },
};

export const amountInWords = (price: number, currency: string): string => {
  const known = CURRENCY_WORDS[currency] ?? null;
  const decimals =
    known?.decimals ??
    (Number.isInteger(price) ? 0 : (price.toString().split('.')[1]?.length ?? 0));

  const roundedPrice = Number(price.toFixed(decimals));
  const integerPart = Math.floor(roundedPrice);
  const fractionalPart = Math.round((roundedPrice - integerPart) * 10 ** decimals);

  if (integerPart === 0 && fractionalPart === 0) {
    return 'Zero';
  }

  let result = numberToWords.toWords(integerPart).replace(/^\w/, (c) => c.toUpperCase());
  if (known?.beforeDecimal != null) {
    result += ` ${known.beforeDecimal}`;
  }
  if (fractionalPart > 0) {
    const fractionalInWords = numberToWords.toWords(fractionalPart);
    result +=
      known?.afterDecimal != null ? ` and ${fractionalInWords} ${known.afterDecimal}` : ` point ${fractionalInWords}`;
  }
  return result;
};

export const formatNumberWithCommas = (value: number): string =>
  value.toLocaleString('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// "August 20, 2026" — Invoify's DATE_OPTIONS rendering.
export const formatLongDate = (isoDate: string): string =>
  new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
