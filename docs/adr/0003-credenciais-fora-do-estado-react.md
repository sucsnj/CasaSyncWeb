# ADR-0003: Credenciais fora do estado React

**Status:** aceito · **Data:** histórico (etapa "Segurança de credenciais", ver `PROJECT_STATUS.md`)

## Contexto
Senha e `masterPin` ficavam em `useState` (inputs controlados) e eram serializadas nos argumentos das Server Actions — visíveis no React DevTools e no overlay de dev do Next em caso de exceção ("senha aparece no console").

## Decisão
- Inputs de credencial são **uncontrolled** (só `name`); leitura via `FormData(event.currentTarget)` **no momento do submit** e descartadas em seguida. A credencial nunca entra na árvore React do cliente.
- Forms de sucesso chamam `event.currentTarget.reset()`.
- Server Actions de credencial **não podem lançar exceção não tratada** (o Next sobreporia o overlay de dev com os argumentos) — sempre `try/catch` retornando `ActionResult` (`ok: false` + mensagem genérica).

## Consequências
- Limite honesto: a senha ainda trafega pela rede (payload HTTPS); o fix garante que não fica em estado/memória React nem em logs/argumentos.
- Formulários com campo de senha marcam `<Input>` com `suppressHydrationWarning` (extensões de gerenciador de senhas causam hydration mismatch — repetido em 3 formulários).