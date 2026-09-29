import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/tenders')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/tenders"!</div>
}
