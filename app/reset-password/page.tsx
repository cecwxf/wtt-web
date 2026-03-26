import ResetPasswordClient from './reset-password-client'

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string }
}) {
  const token = typeof searchParams?.token === 'string' ? searchParams.token : ''
  return <ResetPasswordClient token={token} />
}
