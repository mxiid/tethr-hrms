import { Column, Entity, Index } from 'typeorm';

import { TemporalEntity } from '../../../../core/database/entities/temporal.entity';

// Effective-dated FX rate: `rate` is how many units of `quoteCurrency` one unit
// of `baseCurrency` buys. A historical margin must use the rate of the period it
// belongs to, not today's, so rows are never overwritten — a new rate opens a new
// dated row. Shared by every Finance sibling (compensation, payroll, billing).
@Entity('exchange_rates')
@Index(['organizationId', 'baseCurrency', 'quoteCurrency', 'validFrom'])
export class ExchangeRate extends TemporalEntity {
  @Column({ type: 'varchar', length: 3 })
  baseCurrency!: string;

  @Column({ type: 'varchar', length: 3 })
  quoteCurrency!: string;

  // numeric-as-string to avoid drift; high precision for small FX values.
  @Column({ type: 'numeric', precision: 18, scale: 8 })
  rate!: string;
}
