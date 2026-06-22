import { StudioBuilder } from '@/components/studio/studio-builder'

export default function StudioProjectPage({ params }: { params: { topicId: string } }) {
  return <StudioBuilder topicId={decodeURIComponent(params.topicId)} />
}
