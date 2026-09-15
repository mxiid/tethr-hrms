import { Parent, ResolveField, Resolver } from '@nestjs/graphql';

import { PayslipLineView, PayslipView } from './dto/payslip.view';
import { PayrollRunService } from './payroll-run.service';

// Field resolver for a payslip's component lines. Split from PayrollResolver
// because that class is bound to PayrollRunView — a `lines` field resolver there
// would attach to run lines instead. Resolved on demand, so list queries that
// don't select `lines` stay a single round trip.
@Resolver(() => PayslipView)
export class PayslipLinesResolver {
  constructor(private readonly runService: PayrollRunService) {}

  @ResolveField(() => [PayslipLineView], { nullable: true })
  async lines(@Parent() payslip: PayslipView): Promise<PayslipLineView[]> {
    const { lines } = await this.runService.getPayslipWithLines(payslip.id);
    return lines.map((line) => ({
      id: line.id,
      componentCode: line.componentCode,
      componentName: line.componentName,
      category: line.category,
      taxable: line.taxable,
      dependsOnPaymentDays: line.dependsOnPaymentDays,
      preTax: line.preTax,
      defaultAmount: Number(line.defaultAmount ?? line.amount),
      amount: Number(line.amount),
      sourceType: line.sourceType,
      sourceId: line.sourceId,
    }));
  }
}
