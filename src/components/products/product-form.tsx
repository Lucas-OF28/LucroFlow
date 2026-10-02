"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { MoneyInput, QuantityInput } from "@/components/shared/inputs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createCategoryAction, createProductAction, updateProductAction } from "@/server/actions/domain";

const NONE = "__none__";
const UNITS = ["un", "kg", "g", "l", "ml", "m", "cx", "par"];

export interface ProductFormValues {
  name: string;
  description: string;
  categoryId: string;
  sku: string;
  barcode: string;
  unit: string;
  minStock: string;
  referencePrice: string;
  minimumPrice: string;
  targetMargin: string;
  location: string;
  mainSupplierId: string;
  notes: string;
  status: "ACTIVE" | "INACTIVE";
}

export const EMPTY_PRODUCT: ProductFormValues = {
  name: "", description: "", categoryId: "", sku: "", barcode: "", unit: "un", minStock: "0",
  referencePrice: "", minimumPrice: "", targetMargin: "", location: "", mainSupplierId: "", notes: "", status: "ACTIVE",
};

/** Cadastro de produto: o essencial primeiro, o resto recolhido (progressive disclosure, §101). */
export function ProductForm({
  productId,
  initial = EMPTY_PRODUCT,
  categories: initialCategories,
  suppliers,
}: {
  productId?: string;
  initial?: ProductFormValues;
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [categories, setCategories] = useState(initialCategories);
  const [more, setMore] = useState(Boolean(productId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductFormValues>(k: K, value: ProductFormValues[K]) => setV((p) => ({ ...p, [k]: value }));

  const addCategory = () => {
    const name = window.prompt("Nome da nova categoria");
    if (!name?.trim()) return;
    start(async () => {
      const r = await createCategoryAction({ name });
      if (!r.ok) return void toast.error(r.error);
      setCategories((c) => [...c, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      set("categoryId", r.data.id);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = productId ? await updateProductAction(productId, v) : await createProductAction(v);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      toast.success(productId ? "Produto atualizado." : "Produto cadastrado.");
      const id = productId ?? (r.data as { id: string }).id;
      router.push(`/produtos/${id}`);
    });
  };

  const err = (k: string) => errors[k] && <p className="text-xs text-danger" role="alert">{errors[k]}</p>;

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <Card>
        <CardHeader><CardTitle className="text-base">Essencial</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} required maxLength={160} autoFocus aria-invalid={Boolean(errors.name)} />
            {err("name")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="category">Categoria</Label>
            <div className="flex gap-2">
              <Select value={v.categoryId || NONE} onValueChange={(x) => set("categoryId", x === NONE ? "" : x)}>
                <SelectTrigger id="category" className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={addCategory} aria-label="Nova categoria"><Plus className="size-4" /></Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="referencePrice">Preço de venda de referência</Label>
            <MoneyInput id="referencePrice" value={v.referencePrice} onValueChange={(x) => set("referencePrice", x)} />
            {err("referencePrice")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={v.sku} onChange={(e) => set("sku", e.target.value)} maxLength={64} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="minStock">Estoque mínimo</Label>
            <QuantityInput id="minStock" unit={v.unit} value={v.minStock} onValueChange={(x) => set("minStock", x)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            O estoque começa em zero. A quantidade entra por uma <strong>compra</strong> (ou ajuste), para que custo e capital investido fiquem corretos.
          </p>
        </CardContent>
      </Card>

      <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex items-center gap-1 justify-self-start text-sm font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className={`size-4 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden /> Mais detalhes (opcional)
      </button>

      {more && (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="unit">Unidade</Label>
              <Select value={v.unit} onValueChange={(x) => set("unit", x)}>
                <SelectTrigger id="unit"><SelectValue /></SelectTrigger>
                <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input id="barcode" inputMode="numeric" value={v.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={64} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="minimumPrice">Preço mínimo</Label>
              <MoneyInput id="minimumPrice" value={v.minimumPrice} onValueChange={(x) => set("minimumPrice", x)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="targetMargin">Margem desejada (%)</Label>
              <Input id="targetMargin" inputMode="decimal" value={v.targetMargin} onChange={(e) => set("targetMargin", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Ex.: 30" />
              <p className="text-xs text-muted-foreground">Margem sobre o preço (não markup). Usada para sugerir preço.</p>
              {err("targetMargin")}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="supplier">Fornecedor principal</Label>
              <Select value={v.mainSupplierId || NONE} onValueChange={(x) => set("mainSupplierId", x === NONE ? "" : x)}>
                <SelectTrigger id="supplier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="location">Localização</Label>
              <Input id="location" value={v.location} onChange={(e) => set("location", e.target.value)} placeholder="Ex.: Prateleira A2" maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="status">Status do cadastro</Label>
              <Select value={v.status} onValueChange={(x) => set("status", x as "ACTIVE" | "INACTIVE")}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="INACTIVE">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" value={v.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Salvando…" : productId ? "Salvar alterações" : "Cadastrar produto"}</Button>
        <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>Cancelar</Button>
      </div>
    </form>
  );
}
