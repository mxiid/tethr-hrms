import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('PayComponent')
export class PayComponentView {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  code!: string;

  @Field()
  category!: string;

  @Field()
  taxable!: boolean;

  @Field()
  recurring!: boolean;
}
