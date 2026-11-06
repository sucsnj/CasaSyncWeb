# ADR-0028: Empacotamento Capacitor e push híbrido (Web Push + FCM nativo)

**Status:** aceito • **Data:** 2026

## Contexto
A Web Push API é bloqueada em segundo plano por MIUI/HyperOS (Xiaomi), entregando
notificações apenas ao abrir o PWA. O app passou a ser empacotado via Capacitor
para Android, apontando para a URL remota da Vercel, e as notificações nativas
migram para Firebase Cloud Messaging (FCM).

## Decisão
- **Capacitor** com `server.url = https://casa-sync-web.vercel.app/` e `webDir = out/`.
- **Push híbrido:** `usePushNotifications` detecta `Capacitor.isNativePlatform()`.
  - Nativo: `@capacitor/push-notifications` solicita `POST_NOTIFICATIONS`, obtém
    o token FCM e grava em `push_subscriptions` com `provider = 'FCM_NATIVE'`.
  - Web: fluxo Web Push (VAPID) existente, sem regressão.
- **Backend:** `push_subscriptions` ganha `provider` e `token`; `sendPushNotification`
  bifurca por provedor. FCM nativo usa Firebase Admin (HTTP v1) com
  `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
- **Android:** permissões `INTERNET`, `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`;
  `google-services.json` em `android/app/`; ícone de notificação monocromático
  `ic_stat_ic_notification` (vector drawable) + cor `colorPrimary`.

## Consequências
- Notificações nativas funcionam em background e com app encerrado.
- PWA continua com Web Push.
- Envio FCM depende de credenciais de Service Account corretas na Vercel.