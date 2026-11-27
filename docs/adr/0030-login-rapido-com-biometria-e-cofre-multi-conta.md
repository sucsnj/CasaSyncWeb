# ADR-0030: Login rápido com biometria e cofre multi-conta (Capacitor)

**Status:** aceito • **Data:** 2026

## Contexto
O app Android (Capacitor) precisava permitir login rápido por biometria sem
digitar a senha, inclusive com mais de uma conta salva no mesmo aparelho. O
plugin `@capgo/capacitor-native-biometric` usa `BiometricPrompt` + Android
Keystore, mas o caminho até o fluxo atual passou por três problemas:

1. **Refresh token não serve para o cofre.** A primeira versão guardava o
   `refresh_token` da sessão. Como o Supabase rotaciona refresh tokens e o
   `signOut()` revoga a sessão que o utiliza, o token do cofre era invalidado ao
   sair ou ao alternar contas. Criar uma sessão secundária isolada no login só
   resolvia o primeiro logout: após um login biométrico, a sessão dos cookies
   passava a ser a mesma do cofre e o logout seguinte a revogava.
2. **`server` não isola contas no Android.** O plugin usa chaves internas fixas
   no armazenamento nativo e ignora o parâmetro `server` para separar registros;
   `setCredentials` de uma segunda conta sobrescrevia a primeira.
3. **API do plugin v8.** `getSecureCredentials` só lê credenciais gravadas com
   `accessControl` biométrico. Credenciais sem `accessControl` devem ser lidas
   com `getCredentials` após `verifyIdentity`. Além disso, retornar o `Proxy`
   `NativeBiometric` de dentro de uma função `async` dispara
   `"NativeBiometric.then()" is not implemented on android`.

## Decisão
- **Cofre guarda a senha por conta**, num único JSON multi-conta:
  `setCredentials({ server: 'casasync:vault', username: 'casasync-vault',
  password: JSON.stringify({ [userId]: senha }) })`.
  - `saveToken(userId, senha)` lê o mapa, faz merge e regrava.
  - `verifyAndGetToken(userId)` executa `verifyIdentity()` → `getCredentials()`
    → `JSON.parse(password)` → `map[userId] ?? null`.
  - `deleteToken(userId)` remove só a chave; se sobrar conta, regrava o JSON; se
    esvaziar, chama `deleteCredentials({ server: 'casasync:vault' })`.
- **Autenticação reaproveita o login normal.** O card biométrico lê a senha do
  cofre e chama a Server Action `login(loginIdentifier, senha)`, exatamente como
  o formulário. Não existe ação separada de restauração de sessão.
- **Ativação após login.** Depois de um login bem-sucedido, se
  `Capacitor.isNativePlatform()` e `isAvailable()` indicarem biometria, a senha
  é gravada no cofre (com timeout de 2000ms para não travar o botão) e a conta
  recente é marcada com `biometricEnabled: true`.
- **Logout padrão.** `signOut()` sem `scope` especial; o cofre independe da
  sessão dos cookies.
- **Plugin usado diretamente.** `NativeBiometric` é importado estaticamente e
  consumido dentro de cada método, sempre após checar `Capacitor.isNativePlatform()`.
  Nunca é retornado por função `async`.
- **Contas recentes** ficam em `@capacitor/preferences`
  (`casasync:recent-accounts`) apenas com metadados não sensíveis
  (`userId`, `loginIdentifier`, `displayName`, `avatarUrl`, `role`,
  `biometricEnabled`). O card mostra o avatar do perfil com fallback para as
  iniciais.

## Alternativas rejeitadas
- **Guardar `refresh_token` no cofre:** inviabilizado pela rotação/revogação do
  Supabase ao alternar contas e ao deslogar.
- **Sessão secundária isolada (`persistSession: false`) só para o cofre:**
  resolve o primeiro logout, mas após o login biométrico cookie e cofre
  compartilham a mesma sessão e o próximo logout revoga o token.
- **Uma entrada do plugin por conta (`server: casasync:${userId}`):** o Android
  ignora `server` e sobrescreve a credencial anterior.

## Consequências
- A senha fica criptografada no Android Keystore e só é liberada após
  `verifyIdentity()`; nunca entra em `Preferences`, `localStorage` ou estado React.
- Login rápido funciona com múltiplas contas no mesmo aparelho e sobrevive a
  logout e alternância de contas.
- O login biométrico continua dependendo de rede (é uma Server Action).
- Sem biometria cadastrada (`isAvailable() === false`), a conta é salva sem
  `biometricEnabled` e o card cai no autofill de usuário + foco na senha.
- Remover a conta apaga a credencial correspondente do cofre.
- Dependência nativa: `@capgo/capacitor-native-biometric` +
  `USE_BIOMETRIC` no `AndroidManifest.xml`.

## Referências
- `src/utils/biometric-vault.ts`
- `src/utils/recent-accounts.ts`
- `src/components/auth/login-form.tsx`
- `src/components/auth/sign-out-button.tsx`
- `src/actions/auth.ts`
