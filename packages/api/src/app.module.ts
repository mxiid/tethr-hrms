import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';

import { AuditModule } from './core/audit/audit.module';
import { AuthModule } from './core/auth/auth.module';
import { AuthzModule } from './core/authz/authz.module';
import { PermissionsGuard } from './core/authz/permissions.guard';
import { ConfigModule } from './core/config/config.module';
import { ConfigService } from './core/config/config.service';
import { DatabaseModule } from './core/database/database.module';
import { DocumentsModule } from './core/documents/documents.module';
import { EventsModule } from './core/events/events.module';
import { NotificationModule } from './core/notifications/notification.module';
import { QueueModule } from './core/queue/queue.module';
import { PlatformScopeModule } from './core/tenancy/platform-scope.module';
import { TenancyModule } from './core/tenancy/tenancy.module';
import { TenantContextMiddleware } from './core/tenancy/tenant-context.middleware';
import { WorkflowModule } from './core/workflow/workflow.module';
import { HealthResolver } from './health/health.resolver';
import { AccountModule } from './modules/account/account.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { ClientsModule } from './modules/clients/clients.module';
import { EmployeeModule } from './modules/employee/employee.module';
import { EmployeeRecordsModule } from './modules/employee-records/employee-records.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { FinanceModule } from './modules/finance';
import { FormsModule } from './modules/forms/forms.module';
import { LeaveModule } from './modules/leave/leave.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PositionModule } from './modules/position/position.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';

@Module({
  imports: [
    // Platform layer (core/) — order is not significant; @Global modules export
    // to all. DatabaseModule must be configured before modules that use entities.
    ConfigModule,
    DatabaseModule,
    TenancyModule,
    PlatformScopeModule,
    EventsModule,
    AuditModule,
    AuthModule,
    AuthzModule,
    WorkflowModule,
    NotificationModule,
    QueueModule,
    DocumentsModule,
    // Code-first GraphQL. Schema is generated in memory at boot from the
    // decorators on resolvers and types (architecture.md §2.5, §11).
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Generate the schema in memory at boot — no filesystem dependency.
        autoSchemaFile: true,
        sortSchema: true,
        playground: config.get('GRAPHQL_PLAYGROUND'),
        context: ({ req }: { req: unknown }) => ({ req }),
      }),
    }),
    // HR domain (modules/) — depend on core/, never the reverse.
    OrganizationModule,
    ClientsModule,
    PositionModule,
    EmployeeModule,
    AssignmentModule,
    LeaveModule,
    AttendanceModule,
    FinanceModule,
    RecruitmentModule,
    FormsModule,
    EngagementModule,
    EmployeeRecordsModule,
    AccountModule,
    ExpensesModule,
    BenefitsModule,
  ],
  providers: [
    HealthResolver,
    // Deny-by-default authorization for every entrypoint (GraphQL operations,
    // field resolvers, REST handlers). Operations opt in explicitly through
    // @RequirePermissions/@RequireAnyPermissions or opt out through @Public().
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Establish tenant context for every request before any resolver runs.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
