/**
 * Hands a pack to another teacher. Uses the phone's share sheet when the browser allows the file; Chrome's
 * Web Share only accepts media/text/PDF files, so a .sahpaathi zip usually falls back to a download that the
 * teacher then sends from Files, WhatsApp or Bluetooth.
 */
export async function sharePack(id: string, title: string, zip: Uint8Array<ArrayBuffer>): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([zip], `${id}.sahpaathi`, { type: 'application/zip' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Any other share failure: fall through and save the file instead.
    }
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'saved'
}
