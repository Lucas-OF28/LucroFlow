"use server";

/**
 * Server Actions do domínio. Cada uma:
 *  1. resolve o contexto (sessão + empresa validada no banco) — nunca confia em business_id do cliente;
 *  2. delega ao serviço (que valida de novo com zod, autoriza por papel e roda em transação);
 *  3. revalida as telas afetadas.
 */
import { revalidatePath } from "next/cache";
import { createExpense, createExpenseCategory, cancelExpense } from "../services/expenses";
import { createCustomer, createSupplier, searchCustomersForSelector, updateCustomer, updateSupplier } from "../services/partners";
import {
  archiveCategory,
  archiveProduct,
  createCategory,
  createProduct,
  renameCategory,
  searchProductsForSelector,
  updateProduct,
} from "../services/products";
import { cancelPurchase, createPurchase } from "../services/purchases";
import { receivePayment } from "../services/receivables";
import { createReturn } from "../services/returns";
import { cancelSale, createSale, previewSale } from "../services/sales";
import { adjustStock } from "../services/stock-adjustments";
import { updateBusiness, setUserPreferences } from "../services/businesses";
import { globalSearch } from "../services/search";
import { finalizeProductImageUpload, prepareProductImageUpload, removeProductImage, setPrimaryImage } from "../services/images";
import { tenantAction } from "./_run";

function touch(...paths: string[]) {
  for (const p of ["/", ...paths]) revalidatePath(p, p === "/" ? "layout" : "page");
}

// ─── Produtos e categorias ──────────────────────────────────────────────────
export async function createProductAction(input: unknown) {
  const r = await tenantAction("product.create", (ctx) => createProduct(ctx, input), "Não foi possível cadastrar o produto.");
  if (r.ok) touch("/produtos", "/estoque");
  return r;
}
export async function updateProductAction(id: string, input: unknown) {
  const r = await tenantAction("product.update", (ctx) => updateProduct(ctx, id, input), "Não foi possível salvar o produto.");
  if (r.ok) touch("/produtos", `/produtos/${id}`, "/estoque");
  return r;
}
export async function archiveProductAction(id: string) {
  const r = await tenantAction("product.archive", (ctx) => archiveProduct(ctx, id));
  if (r.ok) touch("/produtos", "/estoque");
  return r;
}
export async function createCategoryAction(input: unknown) {
  const r = await tenantAction("category.create", (ctx) => createCategory(ctx, input));
  if (r.ok) touch("/produtos", "/configuracoes");
  return r;
}
export async function renameCategoryAction(id: string, input: unknown) {
  const r = await tenantAction("category.rename", (ctx) => renameCategory(ctx, id, input));
  if (r.ok) touch("/configuracoes");
  return r;
}
export async function archiveCategoryAction(id: string) {
  const r = await tenantAction("category.archive", (ctx) => archiveCategory(ctx, id));
  if (r.ok) touch("/configuracoes", "/produtos");
  return r;
}
export async function searchProductsAction(q: string, inStockOnly = false) {
  return tenantAction("product.search", (ctx) => searchProductsForSelector(ctx, String(q ?? "").slice(0, 80), { inStockOnly }));
}

// ─── Fornecedores e clientes ────────────────────────────────────────────────
export async function createSupplierAction(input: unknown) {
  const r = await tenantAction("supplier.create", (ctx) => createSupplier(ctx, input));
  if (r.ok) touch("/fornecedores");
  return r;
}
export async function updateSupplierAction(id: string, input: unknown) {
  const r = await tenantAction("supplier.update", (ctx) => updateSupplier(ctx, id, input));
  if (r.ok) touch("/fornecedores", `/fornecedores/${id}`);
  return r;
}
export async function createCustomerAction(input: unknown) {
  const r = await tenantAction("customer.create", (ctx) => createCustomer(ctx, input));
  if (r.ok) touch("/clientes");
  return r;
}
export async function updateCustomerAction(id: string, input: unknown) {
  const r = await tenantAction("customer.update", (ctx) => updateCustomer(ctx, id, input));
  if (r.ok) touch("/clientes", `/clientes/${id}`);
  return r;
}
export async function searchCustomersAction(q: string) {
  return tenantAction("customer.search", (ctx) => searchCustomersForSelector(ctx, String(q ?? "").slice(0, 80)));
}

// ─── Compras ────────────────────────────────────────────────────────────────
export async function createPurchaseAction(input: unknown) {
  const r = await tenantAction("purchase.create", (ctx) => createPurchase(ctx, input), "Não foi possível registrar a compra. Tente novamente.");
  if (r.ok) touch("/compras", "/estoque", "/produtos");
  return r;
}
export async function cancelPurchaseAction(id: string, input: unknown) {
  const r = await tenantAction("purchase.cancel", (ctx) => cancelPurchase(ctx, id, input));
  if (r.ok) touch("/compras", `/compras/${id}`, "/estoque");
  return r;
}

// ─── Vendas ─────────────────────────────────────────────────────────────────
export async function previewSaleAction(input: unknown) {
  return tenantAction("sale.preview", (ctx) => previewSale(ctx, input));
}
export async function createSaleAction(input: unknown) {
  const r = await tenantAction("sale.create", (ctx) => createSale(ctx, input), "Não foi possível registrar a venda. Tente novamente.");
  if (r.ok) touch("/vendas", "/estoque", "/financeiro");
  return r;
}
export async function cancelSaleAction(id: string, input: unknown) {
  const r = await tenantAction("sale.cancel", (ctx) => cancelSale(ctx, id, input), "Não foi possível cancelar a venda.");
  if (r.ok) touch("/vendas", `/vendas/${id}`, "/estoque", "/financeiro");
  return r;
}
export async function createReturnAction(input: unknown) {
  const r = await tenantAction("return.create", (ctx) => createReturn(ctx, input), "Não foi possível registrar a devolução.");
  if (r.ok) touch("/vendas", "/estoque", "/financeiro");
  return r;
}

// ─── Financeiro ─────────────────────────────────────────────────────────────
export async function receivePaymentAction(input: unknown) {
  const r = await tenantAction("receivable.pay", (ctx) => receivePayment(ctx, input), "Não foi possível registrar o recebimento.");
  if (r.ok) touch("/financeiro", "/vendas");
  return r;
}
export async function createExpenseAction(input: unknown) {
  const r = await tenantAction("expense.create", (ctx) => createExpense(ctx, input), "Não foi possível registrar a despesa.");
  if (r.ok) touch("/despesas");
  return r;
}
export async function cancelExpenseAction(id: string) {
  const r = await tenantAction("expense.cancel", (ctx) => cancelExpense(ctx, id));
  if (r.ok) touch("/despesas");
  return r;
}
export async function createExpenseCategoryAction(input: unknown) {
  const r = await tenantAction("expense_category.create", (ctx) => createExpenseCategory(ctx, input));
  if (r.ok) touch("/despesas", "/configuracoes");
  return r;
}

// ─── Estoque ────────────────────────────────────────────────────────────────
export async function adjustStockAction(input: unknown) {
  const r = await tenantAction("inventory.adjust", (ctx) => adjustStock(ctx, input), "Não foi possível ajustar o estoque.");
  if (r.ok) touch("/estoque", "/produtos");
  return r;
}

// ─── Configurações / busca ──────────────────────────────────────────────────
export async function updateBusinessAction(input: unknown) {
  const r = await tenantAction("business.update", (ctx) => updateBusiness(ctx, input));
  if (r.ok) touch("/configuracoes");
  return r;
}
export async function saveThemeAction(theme: "light" | "dark" | "system") {
  return tenantAction("preferences.theme", (ctx) => setUserPreferences(ctx, { theme: ["light", "dark", "system"].includes(theme) ? theme : "system" }));
}
export async function globalSearchAction(q: string) {
  return tenantAction("search", (ctx) => globalSearch(ctx, String(q ?? "").slice(0, 80)));
}

// ─── Fotos ──────────────────────────────────────────────────────────────────
export async function prepareImageUploadAction(productId: string, file: { type: string; size: number }) {
  return tenantAction("product.image_prepare", (ctx) => prepareProductImageUpload(ctx, productId, { type: String(file?.type ?? ""), size: Number(file?.size ?? 0) }), "Não foi possível iniciar o envio da foto.");
}
export async function finalizeImageUploadAction(productId: string, uploadPath: string) {
  const r = await tenantAction("product.image_finalize", (ctx) => finalizeProductImageUpload(ctx, productId, String(uploadPath ?? "")), "Não foi possível processar a foto.");
  if (r.ok) touch(`/produtos/${productId}`, "/produtos", "/estoque");
  return r;
}
export async function removeProductImageAction(imageId: string, productId: string) {
  const r = await tenantAction("product.image_remove", (ctx) => removeProductImage(ctx, imageId));
  if (r.ok) touch(`/produtos/${productId}`, "/produtos", "/estoque");
  return r;
}
export async function setPrimaryImageAction(imageId: string, productId: string) {
  const r = await tenantAction("product.image_primary", (ctx) => setPrimaryImage(ctx, imageId));
  if (r.ok) touch(`/produtos/${productId}`, "/produtos", "/estoque");
  return r;
}
