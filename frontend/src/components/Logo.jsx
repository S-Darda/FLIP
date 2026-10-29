import { Link } from 'react-router-dom'

export default function Logo({ to = '/', size = 40, label = true }) {
  return (
    <Link to={to} className="logo" aria-label="FLIP home">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="12" fill="#0b0f14" />
        <path d="M14 18h22l-6 8H22v6h10l-5 7h-5v9h-8z" fill="#fff" />
        <path d="M40 14l12 12-12 12-5-5 7-7-7-7z" fill="#1abc9c" />
        <path d="M36 38l8 8-8 8-4-4 4-4-4-4z" fill="#16a085" opacity=".8" />
      </svg>
      {label && <span className="logo-text">FLIP</span>}
    </Link>
  )
}
