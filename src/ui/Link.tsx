import type { AnchorHTMLAttributes } from 'react'
import { opensInPlace } from './routes'
import { navigate } from './session'

/** An address in the app. A plain click opens it in place; a modified or middle click keeps the link's own behaviour, such as opening a new tab. */
export function Link({ href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(e) => {
        if (!opensInPlace(e)) return
        e.preventDefault()
        navigate(href)
      }}
    />
  )
}
