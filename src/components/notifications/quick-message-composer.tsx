'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ChevronDown, ImagePlus, Loader2, MessageSquare, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { uploadMedia } from '@/utils/media'
import { sendQuickMessage } from '@/actions/notifications'
import {
  QUICK_MESSAGE_MAX_CHARS,
  QUICK_MESSAGE_MAX_IMAGE_BYTES,
  QUICK_MESSAGE_MAX_IMAGE_MB,
} from '@/utils/quick-message'

const IMAGE_TYPES = 'JPG, PNG ou WebP'

function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Apenas imagens são permitidas.'
  if (file.size > QUICK_MESSAGE_MAX_IMAGE_BYTES) {
    return `A imagem deve ter no máximo ${QUICK_MESSAGE_MAX_IMAGE_MB} MB.`
  }
  return null
}

/**
 * Compositor de "mensagem rápida" do DEPENDENT: texto curto (≤100 caracteres)
 * opcional + até 1 imagem (galeria do dispositivo ou câmera ao vivo). A
 * imagem é enviada ao bucket em `messages/<userId>/...` e a Server Action
 * entrega cópias da notificação para todos os ADMINs da casa.
 */
export function QuickMessageComposer({ userId }: { userId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const galleryRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Câmera ao vivo (getUserMedia) com fallback para o seletor de arquivos.
  useEffect(() => {
    if (!cameraOpen) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      return
    }

    let cancelled = false

    // `navigator.mediaDevices` só existe em contexto seguro (HTTPS/localhost).
    // Em HTTP puro (ex.: acesso por IP na LAN) ele é `undefined` e o acesso a
    // `getUserMedia` lançaria SÍNCRONO antes do `.catch` — por isso tratamos a
    // ausência como uma promessa rejeitada, caindo no mesmo fallback de erro.
    const hasGetUserMedia = !!navigator.mediaDevices?.getUserMedia
    const acquireCamera = hasGetUserMedia
      ? navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      : Promise.reject(new Error('getUserMedia indisponível'))

    acquireCamera
      .catch(() =>
        hasGetUserMedia
          ? navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          : Promise.reject(new Error('getUserMedia indisponível'))
      )
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            'Não foi possível acessar a câmera. Escolha uma imagem do dispositivo.'
          )
        }
      })

    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [cameraOpen])

  async function handleFile(file: File | undefined) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const url = await uploadMedia('messages', file, userId)
      setImageUrl(url)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao enviar a imagem. Tente novamente.'
      )
    } finally {
      setBusy(false)
    }
  }

  function openCamera() {
    setCameraError(null)
    setCameraOpen(true)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setCameraOpen(false)
        void handleFile(
          new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
        )
      },
      'image/jpeg',
      0.85
    )
  }

  async function handleSend() {
    if (!canSend) return
    setError(null)
    setBusy(true)
    const result = await sendQuickMessage(text, imageUrl)
    setBusy(false)
    if (result.ok) {
      setText('')
      setImageUrl(null)
      router.refresh()
    } else {
      setError(result.error)
    }
  }

  const canSend = (text.trim().length > 0 || imageUrl !== null) && !busy

  return (
    <>
      <div className="mb-3 rounded-2xl border border-dashed border-slate-300 bg-white">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 p-3 text-left transition-colors hover:bg-slate-50 active:scale-[0.99]"
        >
          <span className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <MessageSquare className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold text-slate-700">
                Mensagem rápida
              </span>
              <span className="text-xs text-slate-500">
                {open
                  ? 'Clique para recolher.'
                  : `Lembrete curto para seus tutores (máx. ${QUICK_MESSAGE_MAX_CHARS} caracteres).`}
              </span>
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-slate-400 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        {open ? (
          <div className="flex flex-col gap-2 border-t border-dashed border-slate-200 p-3">
            <textarea
              value={text}
              onChange={(event) =>
                setText(event.target.value.slice(0, QUICK_MESSAGE_MAX_CHARS))
              }
              rows={2}
              maxLength={QUICK_MESSAGE_MAX_CHARS}
              placeholder={
                imageUrl
                  ? 'Opicional — escreva um comentário curto…'
                  : 'Ex.: já terminei a lição, pode conferir?'
              }
              className="min-h-20 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-shadow focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
            />
            <p className="mt-1 text-right text-xs text-slate-400">
              {text.length}/{QUICK_MESSAGE_MAX_CHARS}
            </p>

            {imageUrl ? (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <img
                  src={imageUrl}
                  alt="Prévia da imagem da mensagem"
                  className="size-14 rounded-lg border border-slate-200 object-cover"
                />
                <span className="flex-1 text-xs text-slate-500">
                  Imagem anexada à mensagem.
                </span>
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  aria-label="Remover imagem"
                  title="Remover imagem"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10 gap-1.5 rounded-lg text-xs font-semibold"
                  onClick={() => galleryRef.current?.click()}
                  disabled={busy}
                >
                  <ImagePlus className="size-4" />
                  Galeria
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10 gap-1.5 rounded-lg text-xs font-semibold"
                  onClick={openCamera}
                  disabled={busy}
                >
                  <Camera className="size-4" />
                  Câmera
                </Button>
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void handleFile(event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                <span className="text-xs text-slate-400">
                  {IMAGE_TYPES} · até {QUICK_MESSAGE_MAX_IMAGE_MB} MB
                </span>
              </div>
            )}

            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                className="min-h-10 gap-1.5 rounded-lg text-xs font-semibold"
                onClick={() => void handleSend()}
                disabled={!canSend}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {busy ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Capturar foto"
      >
        <div className="flex flex-col gap-3">
          {cameraError ? (
            <>
              <p role="alert" className="text-sm text-red-600">
                {cameraError}
              </p>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-10 gap-1.5 rounded-lg text-xs font-semibold"
                  onClick={() => {
                    setCameraOpen(false)
                    galleryRef.current?.click()
                  }}
                >
                  Escolher do dispositivo
                </Button>
              </div>
            </>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-auto w-full rounded-xl border border-slate-200 bg-black"
              />
              <p className="text-center text-xs text-slate-500">
                Posicione a câmera e toque em capturar.
              </p>
              <div className="flex justify-center">
                <Button
                  type="button"
                  className="min-h-11 gap-1.5 rounded-xl text-sm font-semibold"
                  onClick={capturePhoto}
                >
                  <Camera className="size-4" />
                  Capturar
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}