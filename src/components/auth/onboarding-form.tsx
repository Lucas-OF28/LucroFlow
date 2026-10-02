"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBusinessAction } from "@/server/actions/auth";

export function OnboardingForm({ firstBusiness }: { firstBusiness: boolean }) {
  const [state, action, pending] = useActionState(createBusinessAction, null);
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/Sao_Paulo";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{firstBusiness ? "Bem-vindo ao LucroFlow" : "Nova empresa"}</CardTitle>
        <CardDescription>Vamos configurar seu negócio.</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4">
          {state && !state.ok && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
          <div className="grid gap-1.5">
            <Label htmlFor="name">Nome da empresa</Label>
            <Input id="name" name="name" required maxLength={120} autoFocus placeholder="Ex.: Loja do João" />
          </div>
          <input type="hidden" name="timezone" value={tz || "America/Sao_Paulo"} />
          <p className="text-xs text-muted-foreground">Fuso horário: {tz}. Você pode alterar depois nas configurações.</p>
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>{pending ? "Criando…" : "Começar"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
