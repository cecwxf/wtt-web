import { redirect } from 'next/navigation'

export default function TopicRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/feed?topicId=${encodeURIComponent(params.id)}`)
}
