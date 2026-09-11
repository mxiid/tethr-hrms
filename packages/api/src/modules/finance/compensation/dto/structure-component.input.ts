import { Field, ID, InputType } from '@nestjs/graphql';
import { IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

@InputType()
export class StructureComponentInput {
  @Field(() => ID)
  @IsUUID()
  componentId!: string;

  // Mirrors StructureComponentCalcType — validated against shared values in the service.
  @Field()
  @IsIn(['percentOfGross', 'fixedMonthly'])
  calcType!: string;

  @Field(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000000)
  value!: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sortOrder?: number;
}
