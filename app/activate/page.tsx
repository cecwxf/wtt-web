import ActivateClient from './activate-client'

export default function ActivatePage({
  searchParams,
}: {
  searchParams?: { token?: string }
}) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : ''
  return <ActivateClient token={token} />
}
