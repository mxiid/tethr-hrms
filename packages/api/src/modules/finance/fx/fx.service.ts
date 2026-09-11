import { isIsoDate, rangeContains, type IsoDate } from '@hrms/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { FindOptionsWhere } from 'typeorm';

import { ValidationFailedError } from '../../../common/errors';
import { AuditService } from '../../../core/audit/audit.service';
import { TenantScopedRepository } from '../../../core/tenancy/tenant-scoped.repository';

import { ExchangeRate } from './entities/exchange-rate.entity';
import { EXCHANGE_RATE_REPOSITORY } from './fx.tokens';

export type SetExchangeRateData = {
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly effectiveDate: IsoDate;
  readonly rate: number;
};

const normalizeCurrency = (value: string): string => {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationFailedError('currency must be a 3-letter ISO code');
  }
  return currency;
};

// Shared, effective-dated FX. The published read other Finance modules use to
// compare PKR cost to USD billing using the rate of the relevant period.
@Injectable()
export class FxService {
  constructor(
    @Inject(EXCHANGE_RATE_REPOSITORY)
    private readonly rates: TenantScopedRepository<ExchangeRate>,
    private readonly audit: AuditService,
  ) {}

  // Units of `quoteCurrency` per 1 `baseCurrency` as of `asOf`. Returns 1 for the
  // same currency, the direct rate when one exists, else the inverse if only the
  // reverse pair is configured. Null when no rate can be resolved.
  async getRate(
    baseCurrency: string,
    quoteCurrency: string,
    asOf: IsoDate,
  ): Promise<number | null> {
    const base = normalizeCurrency(baseCurrency);
    const quote = normalizeCurrency(quoteCurrency);
    if (base === quote) {
      return 1;
    }
    const direct = await this.findRate(base, quote, asOf);
    if (direct) {
      return Number(direct.rate);
    }
    const inverse = await this.findRate(quote, base, asOf);
    if (inverse) {
      const rate = Number(inverse.rate);
      return rate === 0 ? null : 1 / rate;
    }
    return null;
  }

  listRates(): Promise<ExchangeRate[]> {
    return this.rates.find({
      order: { baseCurrency: 'ASC', quoteCurrency: 'ASC', validFrom: 'DESC' },
    });
  }

  async setRate(input: SetExchangeRateData): Promise<ExchangeRate> {
    const base = normalizeCurrency(input.baseCurrency);
    const quote = normalizeCurrency(input.quoteCurrency);
    if (base === quote) {
      throw new ValidationFailedError('baseCurrency and quoteCurrency must differ');
    }
    if (!isIsoDate(input.effectiveDate)) {
      throw new ValidationFailedError('effectiveDate must be a valid ISO date');
    }
    if (input.rate <= 0) {
      throw new ValidationFailedError('rate must be greater than zero');
    }
    const existing = await this.rates.findOne({
      where: {
        baseCurrency: base,
        quoteCurrency: quote,
        validFrom: input.effectiveDate,
      } as FindOptionsWhere<ExchangeRate>,
    });
    const rateValue = input.rate.toFixed(8);
    if (existing) {
      existing.rate = rateValue;
      const saved = await this.rates.save(existing);
      await this.audit.record({
        action: 'update',
        resourceType: 'exchange_rate',
        resourceId: saved.id,
        after: { pair: `${base}/${quote}`, validFrom: saved.validFrom, rate: Number(saved.rate) },
      });
      return saved;
    }
    const saved = await this.rates.save(
      this.rates.create({
        baseCurrency: base,
        quoteCurrency: quote,
        validFrom: input.effectiveDate,
        validTo: null,
        rate: rateValue,
      }),
    );
    await this.audit.record({
      action: 'create',
      resourceType: 'exchange_rate',
      resourceId: saved.id,
      after: { pair: `${base}/${quote}`, validFrom: saved.validFrom, rate: Number(saved.rate) },
    });
    return saved;
  }

  private async findRate(
    base: string,
    quote: string,
    asOf: IsoDate,
  ): Promise<ExchangeRate | null> {
    const rows = await this.rates.find({
      where: { baseCurrency: base, quoteCurrency: quote } as FindOptionsWhere<ExchangeRate>,
      order: { validFrom: 'DESC' },
    });
    const covering = rows.find((row) => rangeContains(row, asOf));
    return covering ?? null;
  }
}
