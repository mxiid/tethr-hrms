import { UseGuards } from '@nestjs/common';
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';

import { PERMISSIONS } from '../../../core/authz/permissions';
import { PermissionsGuard } from '../../../core/authz/permissions.guard';
import { RequirePermissions } from '../../../core/authz/require-permissions.decorator';

import { ExchangeRate } from './entities/exchange-rate.entity';
import { FxService } from './fx.service';

@ObjectType('ExchangeRate')
class ExchangeRateView {
  @Field(() => ID)
  id!: string;

  @Field()
  baseCurrency!: string;

  @Field()
  quoteCurrency!: string;

  @Field(() => Number)
  rate!: number;

  @Field()
  validFrom!: string;

  @Field(() => String, { nullable: true })
  validTo!: string | null;
}

const toView = (rate: ExchangeRate): ExchangeRateView => ({
  id: rate.id,
  baseCurrency: rate.baseCurrency,
  quoteCurrency: rate.quoteCurrency,
  rate: Number(rate.rate),
  validFrom: rate.validFrom,
  validTo: rate.validTo,
});

@Resolver(() => ExchangeRateView)
export class FxResolver {
  constructor(private readonly fx: FxService) {}

  @Query(() => [ExchangeRateView])
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async exchangeRates(): Promise<ExchangeRateView[]> {
    return (await this.fx.listRates()).map(toView);
  }

  @Query(() => Number, { nullable: true })
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingRead)
  async exchangeRate(
    @Args('baseCurrency') baseCurrency: string,
    @Args('quoteCurrency') quoteCurrency: string,
    @Args('asOf') asOf: string,
  ): Promise<number | null> {
    return this.fx.getRate(baseCurrency, quoteCurrency, asOf);
  }

  @Mutation(() => ExchangeRateView)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(PERMISSIONS.billingWrite)
  async setExchangeRate(
    @Args('baseCurrency') baseCurrency: string,
    @Args('quoteCurrency') quoteCurrency: string,
    @Args('effectiveDate') effectiveDate: string,
    @Args('rate', { type: () => Number }) rate: number,
  ): Promise<ExchangeRateView> {
    return toView(
      await this.fx.setRate({ baseCurrency, quoteCurrency, effectiveDate, rate }),
    );
  }
}
