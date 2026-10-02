import { relations } from "drizzle-orm";
import { categories, customers, productImages, products, suppliers } from "./catalog";
import { businessMembers, businesses, users } from "./core";
import { expenseCategories, expenses } from "./expenses";
import {
  accountsReceivable,
  payments,
  purchaseItems,
  purchases,
  returnItems,
  returns,
  saleItems,
  sales,
} from "./operations";

export const businessRelations = relations(businesses, ({ many }) => ({ members: many(businessMembers) }));
export const memberRelations = relations(businessMembers, ({ one }) => ({
  business: one(businesses, { fields: [businessMembers.businessId], references: [businesses.id] }),
  user: one(users, { fields: [businessMembers.userId], references: [users.id] }),
}));

export const productRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  mainSupplier: one(suppliers, { fields: [products.mainSupplierId], references: [suppliers.id] }),
  images: many(productImages),
}));
export const productImageRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const purchaseRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  items: many(purchaseItems),
}));
export const purchaseItemRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
}));

export const saleRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  items: many(saleItems),
  receivables: many(accountsReceivable),
  payments: many(payments),
  returns: many(returns),
}));
export const saleItemRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
}));
export const receivableRelations = relations(accountsReceivable, ({ one }) => ({
  sale: one(sales, { fields: [accountsReceivable.saleId], references: [sales.id] }),
  customer: one(customers, { fields: [accountsReceivable.customerId], references: [customers.id] }),
}));
export const paymentRelations = relations(payments, ({ one }) => ({
  sale: one(sales, { fields: [payments.saleId], references: [sales.id] }),
}));
export const returnRelations = relations(returns, ({ one, many }) => ({
  sale: one(sales, { fields: [returns.saleId], references: [sales.id] }),
  items: many(returnItems),
}));
export const returnItemRelations = relations(returnItems, ({ one }) => ({
  return: one(returns, { fields: [returnItems.returnId], references: [returns.id] }),
  product: one(products, { fields: [returnItems.productId], references: [products.id] }),
}));
export const expenseRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, { fields: [expenses.categoryId], references: [expenseCategories.id] }),
}));
