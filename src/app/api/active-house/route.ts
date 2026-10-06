import { getSessionProfile, persistActiveHouseCookie } from '@/utils/house'

/**
 * Grava a casa ativa a partir do **service worker**.
 *
 * Existe porque o `notificationclick` do SW (`public/sw.js`) precisa trocar a
 * casa ANTES de abrir a janela quando o app está fechado — e de lá não há como
 * chamar uma Server Action (o payload do Next depende de um request interno).
 * O SW faz `fetch` same-origin com os cookies, então esta rota é o caminho
 * funcional; usa o mesmo núcleo de `selectHouse`, com a mesma validação de
 * sessão + **membership** ADMIN (o `houseId` do push nunca é confiado).
 *
 * `POST` only: gravar estado numa rota GET seria lido por prefetch/navegação.
 */
export async function POST(request: Request) {
  let houseId: unknown
  try {
    const body = await request.json()
    houseId = body?.houseId
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }

  if (typeof houseId !== 'string' || !houseId) {
    return Response.json({ ok: false }, { status: 400 })
  }

  const { user, profile } = await getSessionProfile()
  if (!user || profile?.user_role !== 'ADMIN') {
    return Response.json({ ok: false }, { status: 403 })
  }

  const result = await persistActiveHouseCookie(user.id, houseId)
  if (!result.ok) {
    return Response.json({ ok: false }, { status: 403 })
  }

  return Response.json({ ok: true })
}