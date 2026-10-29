import DOMPurify from 'dompurify'

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? ''
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    } else if (!href.startsWith('#')) {
      node.removeAttribute('href')
    }
  }
  if (node.tagName === 'INPUT') node.setAttribute('disabled', '')
})

/** Sanitises untrusted document HTML and drops its styling so our typography wins. */
export function clean(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'button', 'object', 'embed', 'link', 'meta', 'base', 'font'],
    FORBID_ATTR: ['style', 'class', 'align', 'bgcolor', 'color', 'width', 'height'],
  })
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
