"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
} from "@/server/actions/auth";

function Feedback({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (!state.ok) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{state.error}</AlertDescription>
      </Alert>
    );
  }
  return state.message ? (
    <Alert role="status">
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  ) : null;
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required {...props} />
    </div>
  );
}

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse o painel do seu negócio.</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4">
          {linkError && !state && (
            <Alert variant="destructive"><AlertDescription>O link expirou ou é inválido. Tente novamente.</AlertDescription></Alert>
          )}
          <Feedback state={state} />
          <input type="hidden" name="next" value={next ?? "/"} />
          <Field id="email" label="E-mail" type="email" autoComplete="email" inputMode="email" />
          <Field id="password" label="Senha" type="password" autoComplete="current-password" minLength={8} />
          <Link href="/recuperar-senha" className="justify-self-end text-sm text-muted-foreground underline-offset-4 hover:underline">
            Esqueci minha senha
          </Link>
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
          <p className="text-sm text-muted-foreground">
            Novo por aqui? <Link href="/cadastro" className="font-medium text-foreground underline-offset-4 hover:underline">Criar conta</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, null);
  if (state?.ok && state.data.needsConfirmation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirme seu e-mail</CardTitle>
          <CardDescription>Enviamos um link de confirmação. Depois de confirmar, você vai configurar seu negócio.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Comece grátis em menos de um minuto.</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4">
          <Feedback state={state} />
          <Field id="fullName" label="Seu nome" autoComplete="name" />
          <Field id="email" label="E-mail" type="email" autoComplete="email" inputMode="email" />
          <Field id="password" label="Senha (mín. 8 caracteres)" type="password" autoComplete="new-password" minLength={8} />
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "Criando…" : "Criar conta"}</Button>
          <p className="text-sm text-muted-foreground">
            Já tem conta? <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">Entrar</Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Enviaremos um link para você definir uma nova senha.</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4">
          <Feedback state={state} />
          <Field id="email" label="E-mail" type="email" autoComplete="email" />
        </CardContent>
        <CardFooter className="mt-4 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Enviando…" : "Enviar link"}</Button>
          <Link href="/login" className="text-sm text-muted-foreground hover:underline">Voltar ao login</Link>
        </CardFooter>
      </form>
    </Card>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova senha</CardTitle>
        <CardDescription>Defina a nova senha da sua conta.</CardDescription>
      </CardHeader>
      <form action={action}>
        <CardContent className="grid gap-4">
          <Feedback state={state} />
          <Field id="password" label="Nova senha" type="password" autoComplete="new-password" minLength={8} />
          <Field id="confirm" label="Confirme a senha" type="password" autoComplete="new-password" minLength={8} />
        </CardContent>
        <CardFooter className="mt-4">
          <Button type="submit" className="w-full" disabled={pending}>{pending ? "Salvando…" : "Salvar nova senha"}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
