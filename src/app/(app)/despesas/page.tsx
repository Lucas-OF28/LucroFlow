import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import { CancelExpenseButton, ExpenseDialog } from "@/components/expenses/expense-dialog";
import { ListFilters } from "@/components/shared/list-filters";
import { DownloadLink } from "@/components/shared/download-link";
import { PageHeader } from "@/components/shared/page-header";
import { Pager } from "@/components/shared/pager";
import { PeriodSelector } from "@/components/shared/period-selector";
import { EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { todayIn } from "@/lib/dates";
import { PAYMENT_METHOD_LABELS, formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import { int, periodFrom, str } from "@/lib/search-params";
import { requireTenant } from "@/server/auth/session";
import { listExpenseCategories, listExpenses } from "@/server/services/expenses";

export const metadata: Metadata = { title: "Despesas" };

export default async function ExpensesPage({ searchParams }: PageProps<"/despesas">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const period = periodFrom(sp, ctx.timezone, "this_month");
  const [list, categories] = await Promise.all([
    listExpenses(ctx, { page: int(sp, "page"), from: period.from, to: period.to, categoryId: str(sp, "categoria"), q: str(sp, "q"), includeCancelled: str(sp, "canceladas") === "1" }),
    listExpenseCategories(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Despesas"
        description="Gastos operacionais (aluguel, marketing, combustível…). Compras de mercadoria ficam em Compras."
        actions={
          <>
            <DownloadLink href={`/api/export/despesas?de=${period.from}&ate=${period.to}`}>CSV</DownloadLink>
            {can(ctx.role, "write") && <ExpenseDialog categories={categories} today={todayIn(ctx.timezone)} defaultOpen={str(sp, "nova") === "1"} />}
          </>
        }
      />
      <ListFilters
        searchPlaceholder="Descrição"
        selects={[
          { name: "categoria", label: "Categoria", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { name: "canceladas", label: "Canceladas", allLabel: "Ocultar canceladas", options: [{ value: "1", label: "Mostrar canceladas" }] },
        ]}
      >
        <PeriodSelector preset={period.preset} from={period.from} to={period.to} />
      </ListFilters>
      {list.rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Nenhuma despesa no período." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden sm:table-cell">Categoria</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="hidden md:table-cell">Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-10"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((e) => (
                <TableRow key={e.id} className={e.cancelledAt ? "opacity-60" : undefined}>
                  <TableCell>
                    {e.description} {e.cancelledAt && <StatusBadge status="CANCELLED" />}
                    <span className="block text-xs text-muted-foreground sm:hidden">{e.categoryName}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{e.categoryName}</TableCell>
                  <TableCell>{formatDate(e.expenseDate)}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : "—"}</TableCell>
                  <TableCell className="tabular text-right">{formatMoney(e.amount)}</TableCell>
                  <TableCell>{!e.cancelledAt && can(ctx.role, "cancel") && <CancelExpenseButton id={e.id} description={e.description} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total do período (sem canceladas)</TableCell>
                <TableCell className="tabular text-right">{formatMoney(list.totalAmount)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/despesas" params={sp} />
    </>
  );
}
